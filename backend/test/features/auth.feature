Feature: Sign in with Google
  Customers sign in with one tap. The backend verifies Google's ID token itself,
  then issues its own session in an HttpOnly, Secure, SameSite=Lax cookie.

  Background:
    Given the API is running

  Scenario: First sign-in creates a customer and starts a session
    When I sign in with Google as "ekaette@example.com" with:
      | first name | Ekaette         |
      | full name  | Ekaette Bassey  |
    Then the response status is 200
    And the response JSON at "user.role" is "customer"
    And the response JSON at "user.firstName" is "Ekaette"
    And the response JSON at "user.email" is "ekaette@example.com"
    And the response sets a secure session cookie
    And there is 1 user in the database
    And an "info" log entry has:
      | event       | auth.sign_in |
      | outcome     | SUCCESS      |
      | role        | customer     |
      | emailDomain | example.com  |
      | isNewUser   | true         |
    And no log entry contains "ekaette@example.com" in full
    And no log entry contains a session token or Google credential

  Scenario: Signing in again updates the same user
    Given I am signed in as "ekaette@example.com"
    When I sign in with Google as "ekaette@example.com" with:
      | first name | Ekaette-Abasi |
    Then the response status is 200
    And there is 1 user in the database
    And the user "ekaette@example.com" has first name "Ekaette-Abasi"

  Scenario: The session identifies the user
    Given I am signed in as "ekaette@example.com"
    When I GET "/api/v1/auth/me"
    Then the response status is 200
    And the response JSON at "user.email" is "ekaette@example.com"
    And the response JSON at "user.role" is "customer"
    And the response header "cache-control" is "no-store"

  Scenario: Without a session, protected routes return 401
    Given I am not signed in
    When I GET "/api/v1/auth/me"
    Then the response status is 401
    And the response JSON at "error.code" is "UNAUTHORIZED"

  Scenario: A tampered session cookie is rejected
    Given I am signed in as "ekaette@example.com"
    And my session cookie is tampered with
    When I GET "/api/v1/auth/me"
    Then the response status is 401

  Scenario: Signing out clears the cookie
    Given I am signed in as "ekaette@example.com"
    When I POST "/api/v1/auth/logout"
    Then the response status is 204
    And the response clears the session cookie
    And an "info" log entry has:
      | event   | auth.sign_out |
      | outcome | SUCCESS       |

  Scenario: Signing out without a session is harmless
    When I POST "/api/v1/auth/logout"
    Then the response status is 204

  Scenario: Missing credential
    When I send the sign-in body:
      """
      {}
      """
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"
    And the response JSON at "error.details" includes a field error for "credential"

  Scenario: A client-supplied role is rejected, never trusted
    When I send the sign-in body:
      """
      { "credential": "abc", "role": "super_admin" }
      """
    Then the response status is 400
    And the response JSON at "error.details" includes a field error for "role"
    And there are 0 users in the database

  Scenario Outline: Invalid Google tokens are refused and logged
    When I sign in with Google as "ekaette@example.com" with:
      | <setting> | <value> |
    Then the response status is 401
    And the response JSON at "error.code" is "INVALID_GOOGLE_TOKEN"
    And no session cookie is set
    And there are 0 users in the database
    And a "warn" log entry has:
      | errorCode | INVALID_GOOGLE_TOKEN |
      | outcome   | FAILED               |

    Examples:
      | setting    | value                                 |
      | audience   | other-app.apps.googleusercontent.com  |
      | issuer     | https://evil.example.com              |
      | expires in | -5m                                   |
      | signed by  | an unknown key                        |

  Scenario: A malformed credential is refused
    When I sign in with the credential "not-a-real-token"
    Then the response status is 401
    And the response JSON at "error.code" is "INVALID_GOOGLE_TOKEN"

  Scenario: An unverified Google email is refused
    When I sign in with Google as "ekaette@example.com" with:
      | email verified | no |
    Then the response status is 401
    And the response JSON at "error.code" is "EMAIL_NOT_VERIFIED"
    And there are 0 users in the database
    And a "warn" log entry has:
      | errorCode | EMAIL_NOT_VERIFIED |

  Scenario: Google's keys are unreachable
    Given the API is running with:
      | GOOGLE_JWKS_URL | http://127.0.0.1:9/oauth2/v3/certs |
    When I sign in with Google as "ekaette@example.com"
    Then the response status is 503
    And the response JSON at "error.code" is "SERVICE_UNAVAILABLE"
    And there are 0 users in the database
    And an "error" log entry has:
      | upstream  | google     |
      | operation | jwks.fetch |

  Scenario Outline: Sign-in from another site is blocked (login CSRF)
    When I sign in with Google as "ekaette@example.com" from origin "<origin>"
    Then the response status is 403
    And the response JSON at "error.code" is "ORIGIN_REJECTED"
    And there are 0 users in the database

    Examples:
      | origin                          |
      | https://evil.com                |
      | https://mustardseed.ng.evil.com |
      | none                            |

  Scenario: Sign-in is rate limited
    Given the API is running with:
      | THROTTLE_STRICT_LIMIT | 2 |
    When I sign in 3 times as "ekaette@example.com"
    Then the response status is 429
    And the response header "retry-after" is a positive integer
