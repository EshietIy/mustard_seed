Feature: Restaurant settings
  A super admin sets the delivery fee and the opening hours from the Settings screen. The new
  values reach the website, the app, quotes, orders and emails at once, because they are read
  fresh from the database. Every change is logged and audited. Supervisors, customers and
  signed-out callers may not see or change settings (AGENT.md 3.4).

  Background:
    Given the API is running

  # ---------- happy paths ----------

  Scenario: A super admin sees the current settings
    Given I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/settings"
    Then the response status is 200
    And the response header "cache-control" is "no-store"
    And the response JSON at "deliveryFeeKobo" is JSON:
      """
      150000
      """
    And the response JSON at "deliveryArea" is "Calabar"
    And the response JSON at "opensAt" is "08:00"
    And the response JSON at "closesAt" is "23:00"
    And the response JSON at "onlineOrdersCloseAt" is "22:30"
    And the response JSON at "timezone" is "Africa/Lagos"

  Scenario: A super admin changes the delivery fee, and customers see it at once
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/settings" with JSON:
      """
      { "deliveryFeeKobo": 200000 }
      """
    Then the response status is 200
    And the response JSON at "deliveryFeeKobo" is JSON:
      """
      200000
      """
    And an audit event "settings.updated" with outcome "SUCCESS" is recorded
    And that audit event carries the request id
    And an "info" log entry has:
      | event   | settings.updated |
      | outcome | SUCCESS          |
    When I GET "/api/v1/site"
    Then the response JSON at "delivery.feeKobo" is JSON:
      """
      200000
      """

  Scenario: A super admin changes the opening hours
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/settings" with JSON:
      """
      { "opensAt": "09:00", "closesAt": "22:00", "onlineOrdersCloseAt": "21:30" }
      """
    Then the response status is 200
    And the response JSON at "opensAt" is "09:00"
    When I GET "/api/v1/site"
    Then the response JSON at "hours.opensAt" is "09:00"
    And the response JSON at "hours.closesAt" is "22:00"
    And the response JSON at "hours.onlineOrdersCloseAt" is "21:30"

  Scenario: Free delivery is allowed
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/settings" with JSON:
      """
      { "deliveryFeeKobo": 0 }
      """
    Then the response status is 200
    And the response JSON at "deliveryFeeKobo" is JSON:
      """
      0
      """

  # ---------- sad paths ----------

  Scenario Outline: Only a super admin sees settings (<who>)
    Given <session>
    When I GET the admin path "/settings"
    Then the response status is <status>

    Examples:
      | who          | session                                             | status |
      | signed out   | I am not signed in                                  | 401    |
      | a customer   | I am signed in as "ekaette@example.com"             | 403    |
      | a supervisor | I am signed in as the supervisor "chef@example.com" | 403    |

  Scenario Outline: Only a super admin changes settings (<who>)
    Given <session>
    When I PATCH the admin path "/settings" with JSON:
      """
      { "deliveryFeeKobo": 100 }
      """
    Then the response status is <status>
    When I GET "/api/v1/site"
    Then the response JSON at "delivery.feeKobo" is JSON:
      """
      150000
      """

    Examples:
      | who          | session                                             | status |
      | signed out   | I am not signed in                                  | 401    |
      | a customer   | I am signed in as "ekaette@example.com"             | 403    |
      | a supervisor | I am signed in as the supervisor "chef@example.com" | 403    |

  Scenario Outline: Malformed settings are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/settings" with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"
    And the response JSON at "error.details" includes a field error for "<field>"

    Examples:
      | case               | body                                  | field               |
      | negative fee       | { "deliveryFeeKobo": -1 }             | deliveryFeeKobo     |
      | fee in naira float | { "deliveryFeeKobo": 1500.5 }         | deliveryFeeKobo     |
      | fee far too big    | { "deliveryFeeKobo": 100000001 }      | deliveryFeeKobo     |
      | not a time         | { "opensAt": "8am" }                  | opensAt             |
      | impossible time    | { "closesAt": "24:00" }               | closesAt            |
      | cut-off as number  | { "onlineOrdersCloseAt": 2230 }       | onlineOrdersCloseAt |
      | read-only area     | { "deliveryArea": "Uyo" }             | deliveryArea        |
      | unknown field      | { "phone": "0800" }                   | phone               |

  Scenario: An empty change is refused
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/settings" with JSON:
      """
      {}
      """
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"

  Scenario Outline: Hours that leave no time to order are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/settings" with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the response JSON at "error.code" is "INVALID_HOURS"
    And a "warn" log entry has:
      | outcome | FAILED |
    When I GET "/api/v1/site"
    Then the response JSON at "hours.opensAt" is "08:00"

    Examples:
      | case                         | body                                                  |
      | cut-off before opening       | { "onlineOrdersCloseAt": "07:30" }                    |
      | cut-off at opening           | { "opensAt": "22:30" }                                |
      | cut-off after closing        | { "closesAt": "22:00" }                               |
      | opening after closing        | { "opensAt": "23:30", "onlineOrdersCloseAt": "23:45" } |

  Scenario: The database being down gives a safe 503
    Given I am signed in as the super admin "owner@example.com"
    And the database is unreachable
    When I PATCH the admin path "/settings" with JSON:
      """
      { "deliveryFeeKobo": 200000 }
      """
    Then the response status is 503
    And the response body does not contain "127.0.0.1"
