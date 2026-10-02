Feature: Staff provisioning and roles
  Staff are provisioned on the backend only. They sign in with Google like everyone
  else, and get a staff role only if their verified email matches an active staff record.

  Background:
    Given the API is running

  Scenario: The seed script creates the first super admin, who can then manage staff
    When the seed script runs with SEED_SUPER_ADMIN_EMAIL " Owner@Example.com "
    Then the staff member "owner@example.com" has:
      | role       | super_admin |
      | active     | yes         |
      | created by | nobody      |
    And an "info" log entry has:
      | event   | staff.seeded |
      | created | true         |
    When I sign in with Google as "owner@example.com"
    Then the response JSON at "user.role" is "super_admin"
    When I GET "/api/v1/admin/staff"
    Then the response status is 200

  Scenario: The seed script is safe to run again
    Given "owner@example.com" is provisioned as a deactivated "supervisor"
    When the seed script runs with SEED_SUPER_ADMIN_EMAIL "owner@example.com"
    Then there are 1 staff members
    And the staff member "owner@example.com" has:
      | role   | super_admin |
      | active | yes         |

  Scenario: A super admin adds a supervisor, who then signs in with that role
    Given I am signed in as the super admin "owner@example.com"
    When I POST "/api/v1/admin/staff" with JSON:
      """
      { "email": " Chef@Example.com ", "role": "supervisor" }
      """
    Then the response status is 201
    And the response JSON at "email" is "chef@example.com"
    And the response JSON at "role" is "supervisor"
    And the staff member "chef@example.com" has:
      | role       | supervisor |
      | created by | someone    |
    And an "info" log entry has:
      | event       | staff.created |
      | outcome     | SUCCESS       |
      | role        | supervisor    |
      | emailDomain | example.com   |
    When I sign in with Google as "chef@example.com"
    Then the response JSON at "user.role" is "supervisor"

  Scenario: Super admins can list staff
    Given "chef@example.com" is provisioned as an active "supervisor"
    And I am signed in as the super admin "owner@example.com"
    When I GET "/api/v1/admin/staff"
    Then the response status is 200
    And the response JSON at "0.email" is "chef@example.com"

  Scenario: Adding an email that is already staff
    Given "chef@example.com" is provisioned as an active "supervisor"
    And I am signed in as the super admin "owner@example.com"
    When I POST "/api/v1/admin/staff" with JSON:
      """
      { "email": "chef@example.com", "role": "super_admin" }
      """
    Then the response status is 409
    And the response JSON at "error.code" is "STAFF_EXISTS"

  Scenario Outline: Invalid staff input
    Given I am signed in as the super admin "owner@example.com"
    When I POST "/api/v1/admin/staff" with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the response JSON at "error.details" includes a field error for "<field>"

    Examples:
      | body                                                   | field   |
      | { "email": "chef@example.com", "role": "customer" }    | role    |
      | { "email": "not-an-email", "role": "supervisor" }      | email   |
      | { "email": "chef@example.com" }                        | role    |
      | { "email": "a@b.co", "role": "supervisor", "x": 1 }    | x       |

  Scenario: Changing a role takes effect on the person's next request
    Given "chef@example.com" is provisioned as an active "supervisor"
    And I am signed in as "chef@example.com"
    And I am signed in as the super admin "owner@example.com"
    When I PATCH the staff member "chef@example.com" with:
      """
      { "role": "super_admin" }
      """
    Then the response status is 200
    And an "info" log entry has:
      | event        | staff.role_changed |
      | previousRole | supervisor         |
      | role         | super_admin        |
    Given I act as "chef@example.com"
    When I GET "/api/v1/auth/me"
    Then the response JSON at "user.role" is "super_admin"

  Scenario: Deactivation removes staff access immediately, even for an existing session
    Given "second@example.com" is provisioned as an active "super_admin"
    And I am signed in as "second@example.com"
    And I am signed in as the super admin "owner@example.com"
    When I PATCH the staff member "second@example.com" with:
      """
      { "isActive": false }
      """
    Then the response status is 200
    And the response JSON at "isActive" is JSON:
      """
      false
      """
    And an "info" log entry has:
      | event | staff.deactivated |
    Given I act as "second@example.com"
    When I GET "/api/v1/admin/staff"
    Then the response status is 403
    When I GET "/api/v1/auth/me"
    Then the response JSON at "user.role" is "customer"

  Scenario: Reactivating restores access
    Given "chef@example.com" is provisioned as a deactivated "supervisor"
    And I am signed in as the super admin "owner@example.com"
    When I PATCH the staff member "chef@example.com" with:
      """
      { "isActive": true }
      """
    Then the response status is 200
    And an "info" log entry has:
      | event | staff.reactivated |

  Scenario: The last active super admin cannot be removed
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the staff member "owner@example.com" with:
      """
      { "isActive": false }
      """
    Then the response status is 409
    And the response JSON at "error.code" is "LAST_SUPER_ADMIN"
    And the staff member "owner@example.com" has:
      | active | yes |

  Scenario: An empty change is rejected
    Given "chef@example.com" is provisioned as an active "supervisor"
    And I am signed in as the super admin "owner@example.com"
    When I PATCH the staff member "chef@example.com" with:
      """
      {}
      """
    Then the response status is 400

  Scenario: Unknown or malformed staff ids
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH "/api/v1/admin/staff/00000000-0000-4000-8000-000000000000" with JSON:
      """
      { "isActive": false }
      """
    Then the response status is 404
    And the response JSON at "error.code" is "STAFF_NOT_FOUND"
    When I PATCH "/api/v1/admin/staff/not-a-uuid" with JSON:
      """
      { "isActive": false }
      """
    Then the response status is 400

  Scenario: Unauthenticated callers get 401
    When I GET "/api/v1/admin/staff"
    Then the response status is 401

  Scenario: A customer cannot reach staff management
    Given I am signed in as "customer@example.com"
    When I GET "/api/v1/admin/staff"
    Then the response status is 403
    And the response JSON at "error.code" is "FORBIDDEN"
    And a "warn" log entry has:
      | errorCode | FORBIDDEN |
      | outcome   | FAILED    |

  Scenario: A supervisor cannot reach super-admin routes
    Given I am signed in as the supervisor "chef@example.com"
    When I POST "/api/v1/admin/staff" with JSON:
      """
      { "email": "friend@example.com", "role": "super_admin" }
      """
    Then the response status is 403
    And there are 1 staff members

  Scenario: An unprovisioned email gets a customer session at most
    When I sign in with Google as "stranger@example.com"
    Then the response JSON at "user.role" is "customer"
    When I GET "/api/v1/admin/staff"
    Then the response status is 403

  Scenario: A deactivated staff member signs in as a customer and is refused staff routes
    Given "old@example.com" is provisioned as a deactivated "super_admin"
    When I sign in with Google as "old@example.com"
    Then the response JSON at "user.role" is "customer"
    When I GET "/api/v1/admin/staff"
    Then the response status is 403

  Scenario Outline: State changes from another site are blocked (CSRF)
    Given I am signed in as the super admin "owner@example.com"
    When I POST "/api/v1/admin/staff" with JSON from origin "<origin>":
      """
      { "email": "intruder@example.com", "role": "super_admin" }
      """
    Then the response status is 403
    And the response JSON at "error.code" is "ORIGIN_REJECTED"
    And there are 1 staff members

    Examples:
      | origin           |
      | https://evil.com |
      | none             |
