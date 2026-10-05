Feature: Signing in from the Android app
  The app signs in with Google and gets bearer tokens: a short-lived access token and a
  single-use refresh token (AGENT.md section 15). Users, roles and staff rules are the
  website's. Old app versions are told to update.

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name | category | price |
      | Zobo | drinks   | 80000 |

  # ---------- happy paths ----------

  Scenario: The app signs in and uses its access token
    When the app signs in with Google as "ekaette@example.com"
    Then the response status is 200
    And the response has app tokens for "ekaette@example.com"
    And an "info" log entry has:
      | event   | auth.app_sign_in |
      | outcome | SUCCESS          |
    When the app GETs "/api/v1/auth/me"
    Then the response status is 200
    And the response JSON at "user.email" is "ekaette@example.com"
    And no log entry contains the app tokens

  Scenario: A bearer request changes data without a browser Origin (no CSRF check applies)
    When the app signs in with Google as "ekaette@example.com"
    And the app PUTs "/api/v1/cart/lines" with JSON:
      """
      { "menuItemId": "{{item:Zobo}}", "quantity": 2 }
      """
    Then the response status is 200
    And the response JSON at "itemCount" is JSON:
      """
      2
      """

  Scenario: The app and the website share the same account and cart
    Given I am signed in as "ekaette@example.com"
    And I set "Zobo x3" in my cart
    When the app signs in with Google as "ekaette@example.com"
    And the app GETs "/api/v1/cart"
    Then the response JSON at "itemCount" is JSON:
      """
      3
      """

  Scenario: Staff get their role in the app too
    Given "chef@example.com" is provisioned as an active "supervisor"
    When the app signs in with Google as "chef@example.com"
    Then the response JSON at "user.role" is "supervisor"
    When the app GETs "/api/v1/admin/option-groups"
    Then the response status is 200

  Scenario: Refreshing gives new tokens and spends the old refresh token
    When the app signs in with Google as "ekaette@example.com"
    And the app refreshes its tokens
    Then the response status is 200
    And the response has app tokens for "ekaette@example.com"
    When the app GETs "/api/v1/auth/me"
    Then the response status is 200
    And no log entry contains the app tokens

  Scenario: Signing out ends the session
    When the app signs in with Google as "ekaette@example.com"
    And the app signs out
    Then the response status is 204
    When the app refreshes its tokens
    Then the response status is 401
    And the response JSON at "error.code" is "SESSION_EXPIRED"

  # ---------- sad paths ----------

  Scenario: A replayed refresh token signs the whole session out
    When the app signs in with Google as "ekaette@example.com"
    And the app refreshes its tokens
    And someone replays the previous refresh token
    Then the response status is 401
    And the response JSON at "error.code" is "SESSION_REVOKED"
    When the app refreshes its tokens
    Then the response status is 401
    And the response JSON at "error.code" is "SESSION_EXPIRED"

  Scenario: An unverified Google email is refused
    When the app signs in with Google as "ekaette@example.com" with an unverified email
    Then the response status is 401
    And the response JSON at "error.code" is "EMAIL_NOT_VERIFIED"

  Scenario: A garbage bearer token is refused
    Given the app uses the bearer token "not-a-token"
    When the app GETs "/api/v1/auth/me"
    Then the response status is 401

  Scenario: A website session cookie can't be used as an app token
    Given I am signed in as "ekaette@example.com"
    When the app uses my website session cookie value as its bearer token
    And the app GETs "/api/v1/auth/me"
    Then the response status is 401

  Scenario: A customer using the app can't reach staff routes
    When the app signs in with Google as "ekaette@example.com"
    And the app GETs "/api/v1/admin/option-groups"
    Then the response status is 403

  Scenario Outline: Malformed sign-in and refresh requests are refused (<case>)
    When the app POSTs "<path>" with JSON:
      """
      <body>
      """
    Then the response status is <status>
    And the response JSON at "error.code" is "<code>"

    Examples:
      | case                 | path                      | body                       | status | code              |
      | missing ID token     | /api/v1/auth/app/google   | { }                        | 400    | VALIDATION_FAILED |
      | invalid ID token     | /api/v1/auth/app/google   | { "idToken": "nope" }      | 401    | INVALID_GOOGLE_TOKEN |
      | missing refresh      | /api/v1/auth/app/refresh  | { }                        | 400    | VALIDATION_FAILED |
      | unknown refresh      | /api/v1/auth/app/refresh  | { "refreshToken": "nope" } | 401    | SESSION_EXPIRED   |

  # ---------- app version ----------

  Scenario Outline: The minimum app version (<case>)
    Given the API is running with:
      | APP_MIN_VERSION | 1.2.0 |
    And the app is version "<version>"
    When the app GETs "/api/v1/menu"
    Then the response status is <status>

    Examples:
      | case        | version | status |
      | current     | 1.2.0   | 200    |
      | newer       | 1.10.0  | 200    |
      | outdated    | 1.1.9   | 426    |
      | not a version | beta  | 426    |

  Scenario: An outdated app is told why
    Given the API is running with:
      | APP_MIN_VERSION | 1.2.0 |
    And the app is version "1.0.0"
    When the app GETs "/api/v1/menu"
    Then the response status is 426
    And the response JSON at "error.code" is "APP_UPDATE_REQUIRED"
    And the response JSON at "error.message" is "Please update the app to keep ordering."

  Scenario: The website is never affected by the app version check
    Given the API is running with:
      | APP_MIN_VERSION | 9.0.0 |
    When I GET "/api/v1/menu"
    Then the response status is 200
