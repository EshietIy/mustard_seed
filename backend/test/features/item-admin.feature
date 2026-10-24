Feature: Managing dishes
  Staff switch a dish off when the kitchen runs out and back on when it is ready again.
  A switched-off dish stays on the menu as sold out and cannot be ordered. Supervisors and
  super admins may do this. Only a super admin sets a dish's price; a dish with no price shows
  [PRICE] and cannot be ordered. Customers and signed-out callers may do none of it
  (AGENT.md 3.4, 11).

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name       | category      | price  |
      | Afang Soup | calabar_soups | 400000 |
      | Zobo       | fresh_juices  | 80000  |

  # ---------- happy paths ----------

  Scenario: A supervisor switches a dish off
    Given I am signed in as the supervisor "chef@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "isAvailable": false }
      """
    Then the response status is 200
    And the response JSON at "name" is "Afang Soup"
    And the response JSON at "isAvailable" is JSON:
      """
      false
      """
    And the response header "cache-control" is "no-store"
    And the menu shows "Afang Soup" as unavailable
    And the menu shows "Zobo" as available
    And an audit event "menu_item.updated" with outcome "SUCCESS" is recorded
    And an "info" log entry has:
      | event   | menu_item.updated |
      | outcome | SUCCESS           |

  Scenario: A super admin switches a dish back on
    Given the menu item "Zobo" is marked unavailable
    And I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Zobo}}" with JSON:
      """
      { "isAvailable": true }
      """
    Then the response status is 200
    And the response JSON at "isAvailable" is JSON:
      """
      true
      """
    And the menu shows "Zobo" as available

  Scenario: A switched-off dish can no longer be ordered
    Given I am signed in as the supervisor "chef@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "isAvailable": false }
      """
    And I am signed in as "ekaette@example.com"
    And I ask for a quote with:
      | fulfilment | pickup        |
      | items      | Afang Soup x1 |
    Then the response status is 200
    And the response JSON at "canPlaceOrder" is JSON:
      """
      false
      """

  Scenario: A super admin sets a dish's price, and new quotes use it
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "priceKobo": 450000 }
      """
    Then the response status is 200
    And the response JSON at "priceKobo" is JSON:
      """
      450000
      """
    And an audit event "menu_item.updated" with outcome "SUCCESS" is recorded
    When I ask for a quote with:
      | fulfilment | pickup        |
      | items      | Afang Soup x1 |
    Then the response JSON at "subtotalKobo" is JSON:
      """
      450000
      """

  Scenario: A super admin takes a dish's price away until the real one is known
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Zobo}}" with JSON:
      """
      { "priceKobo": null }
      """
    Then the response status is 200
    And the response JSON at "priceKobo" is JSON:
      """
      null
      """
    When I ask for a quote with:
      | fulfilment | pickup  |
      | items      | Zobo x1 |
    Then the response JSON at "canPlaceOrder" is JSON:
      """
      false
      """

  Scenario: A super admin changes the price and availability together
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Zobo}}" with JSON:
      """
      { "priceKobo": 90000, "isAvailable": false }
      """
    Then the response status is 200
    And the response JSON at "priceKobo" is JSON:
      """
      90000
      """
    And the menu shows "Zobo" as unavailable

  # ---------- sad paths ----------

  Scenario Outline: Who may switch dishes (<who>)
    Given <session>
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "isAvailable": false }
      """
    Then the response status is <status>
    And the menu shows "Afang Soup" as available

    Examples:
      | who        | session                                 | status |
      | signed out | I am not signed in                      | 401    |
      | a customer | I am signed in as "ekaette@example.com" | 403    |

  Scenario: A supervisor cannot change a price
    Given I am signed in as the supervisor "chef@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "priceKobo": 1000, "isAvailable": false }
      """
    Then the response status is 403
    And the response JSON at "error.code" is "SUPER_ADMIN_ONLY"
    And the menu shows "Afang Soup" as available
    When I ask for a quote with:
      | fulfilment | pickup        |
      | items      | Afang Soup x1 |
    Then the response JSON at "subtotalKobo" is JSON:
      """
      400000
      """

  Scenario Outline: Invalid changes are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "<path>" with JSON:
      """
      <body>
      """
    Then the response status is <status>
    And the response JSON at "error.code" is "<code>"
    And the menu shows "Afang Soup" as available

    Examples:
      | case              | path                                                   | body                                     | status | code                |
      | nothing to change | /menu-items/{{item:Afang Soup}}                        | { }                                      | 400    | VALIDATION_FAILED   |
      | not a yes or no   | /menu-items/{{item:Afang Soup}}                        | { "isAvailable": "no" }                  | 400    | VALIDATION_FAILED   |
      | unknown field     | /menu-items/{{item:Afang Soup}}                        | { "isAvailable": false, "name": "Afia" } | 400    | VALIDATION_FAILED   |
      | zero price        | /menu-items/{{item:Afang Soup}}                        | { "priceKobo": 0 }                       | 400    | VALIDATION_FAILED   |
      | fractional price  | /menu-items/{{item:Afang Soup}}                        | { "priceKobo": 1500.5 }                  | 400    | VALIDATION_FAILED   |
      | price in text     | /menu-items/{{item:Afang Soup}}                        | { "priceKobo": "4500" }                  | 400    | VALIDATION_FAILED   |
      | too high a price  | /menu-items/{{item:Afang Soup}}                        | { "priceKobo": 100000001 }               | 400    | VALIDATION_FAILED   |
      | unknown item      | /menu-items/00000000-0000-4000-8000-000000000000       | { "isAvailable": false }                 | 404    | MENU_ITEM_NOT_FOUND |
      | malformed id      | /menu-items/not-a-uuid                                 | { "isAvailable": false }                 | 400    | BAD_REQUEST         |

  Scenario: An unknown dish is logged as a refused change
    Given I am signed in as the supervisor "chef@example.com"
    When I PATCH the admin path "/menu-items/00000000-0000-4000-8000-000000000000" with JSON:
      """
      { "isAvailable": false }
      """
    Then the response status is 404
    And a "warn" log entry has:
      | outcome | FAILED |

  Scenario: The database being down gives a safe 503
    Given I am signed in as the supervisor "chef@example.com"
    And the database is unreachable
    When I PATCH the admin path "/menu-items/00000000-0000-4000-8000-000000000000" with JSON:
      """
      { "isAvailable": false }
      """
    Then the response status is 503
    And the response body does not contain "127.0.0.1"
