Feature: Adding, editing, ordering and retiring dishes
  A super admin adds new dishes, changes a dish's name, description, category and "House
  signature" mark, moves dishes up or down within their category, and retires dishes. A new
  dish starts switched off so it can be checked before customers order it. Retired dishes are
  archived, never deleted, so past orders still show them; they leave the menu and cannot be
  ordered, and can be brought back. Supervisors, customers and signed-out callers may do none
  of this (AGENT.md 3.4, slice 8).

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name        | category      | price  | sort order |
      | Afang Soup  | calabar_soups | 400000 | 10         |
      | Edikang     | calabar_soups | 450000 | 20         |
      | Fisherman   | calabar_soups | 500000 | 30         |
      | Zobo        | fresh_juices  | 80000  | 10         |

  # ---------- happy paths ----------

  Scenario: A super admin sees every dish, retired ones included
    Given the menu item "Fisherman" is retired
    And I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/menu-items"
    Then the response status is 200
    And the response lists the dishes "Afang Soup, Edikang, Fisherman, Zobo"
    And the response header "cache-control" is "no-store"
    And the listed dish "Fisherman" is retired
    And the listed dish "Afang Soup" is not retired

  Scenario: A super admin adds a dish, and it starts switched off
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items" with JSON:
      """
      {
        "name": "  Ekpang Nkukwo ",
        "description": "Grated cocoyam in cocoyam leaves",
        "category": "rice_native",
        "isHouseSignature": true,
        "priceKobo": 550000
      }
      """
    Then the response status is 201
    And the response JSON at "id" is a UUID
    And the response JSON at "name" is "Ekpang Nkukwo"
    And the response JSON at "isAvailable" is JSON:
      """
      false
      """
    And the response JSON at "archivedAt" is JSON:
      """
      null
      """
    And the menu shows "Ekpang Nkukwo" as unavailable
    And the dish "Ekpang Nkukwo" has:
      | slug               | ekpang-nkukwo |
      | is_house_signature | true          |
      | price_kobo         | 550000        |
    And an audit event "menu_item.created" with outcome "SUCCESS" is recorded
    And an "info" log entry has:
      | event   | menu_item.created |
      | outcome | SUCCESS           |

  Scenario: A dish added without a price shows [PRICE] and goes last in its category
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items" with JSON:
      """
      { "name": "Atama Soup", "category": "calabar_soups" }
      """
    Then the response status is 201
    And the response JSON at "priceKobo" is JSON:
      """
      null
      """
    And the response JSON at "description" is ""
    And the menu category "calabar_soups" lists, in order:
      | Afang Soup |
      | Edikang    |
      | Fisherman  |
      | Atama Soup |

  Scenario: A new fresh juice is shown in the Fresh juices band
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items" with JSON:
      """
      { "name": "Pineapple Ginger", "category": "fresh_juices" }
      """
    Then the response status is 201
    And the dish "Pineapple Ginger" has:
      | is_fresh_juice | true |

  Scenario: A dish named like a retired one gets its own web address
    Given the menu item "Fisherman" is retired
    And I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items" with JSON:
      """
      { "name": "fisherman", "category": "calabar_soups" }
      """
    Then the response status is 201
    And the dish "fisherman" has:
      | slug | fisherman-2 |

  Scenario: A super admin renames a dish and rewrites its description
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Edikang}}" with JSON:
      """
      { "name": "Edikang Ikong", "description": "Pumpkin leaf and waterleaf soup" }
      """
    Then the response status is 200
    And the response JSON at "name" is "Edikang Ikong"
    And the response JSON at "description" is "Pumpkin leaf and waterleaf soup"
    And the menu shows "Edikang Ikong" as available
    And an audit event "menu_item.updated" with outcome "SUCCESS" is recorded

  Scenario: A super admin marks a dish as a house signature
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "isHouseSignature": true }
      """
    Then the response status is 200
    And the response JSON at "isHouseSignature" is JSON:
      """
      true
      """

  Scenario: Moving a dish to another category puts it last there
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "category": "fresh_juices" }
      """
    Then the response status is 200
    And the response JSON at "category" is "fresh_juices"
    And the menu category "fresh_juices" lists, in order:
      | Zobo       |
      | Afang Soup |
    And the dish "Afang Soup" has:
      | is_fresh_juice | true |

  Scenario Outline: A super admin moves a dish <direction>
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items/{{item:Edikang}}/move" with JSON:
      """
      { "direction": "<direction>" }
      """
    Then the response status is 200
    And the menu category "calabar_soups" lists, in order:
      | <first>  |
      | <second> |
      | <third>  |
    And an audit event "menu_item.moved" with outcome "SUCCESS" is recorded

    Examples:
      | direction | first      | second     | third     |
      | up        | Edikang    | Afang Soup | Fisherman |
      | down      | Afang Soup | Fisherman  | Edikang   |

  Scenario: Moving the first dish up changes nothing
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items/{{item:Afang Soup}}/move" with JSON:
      """
      { "direction": "up" }
      """
    Then the response status is 200
    And the menu category "calabar_soups" lists, in order:
      | Afang Soup |
      | Edikang    |
      | Fisherman  |

  Scenario: Moving skips over retired dishes
    Given the menu item "Edikang" is retired
    And I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items/{{item:Fisherman}}/move" with JSON:
      """
      { "direction": "up" }
      """
    Then the response status is 200
    And the menu category "calabar_soups" lists, in order:
      | Fisherman  |
      | Afang Soup |

  Scenario: A retired dish leaves the menu and cannot be ordered
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "isArchived": true }
      """
    Then the response status is 200
    And the response JSON at "archivedAt" is a timestamp
    And the menu does not show "Afang Soup"
    And an audit event "menu_item.archived" with outcome "SUCCESS" is recorded
    When I am signed in as "ekaette@example.com"
    And I ask for a quote with:
      | fulfilment | pickup        |
      | items      | Afang Soup x1 |
    Then the response JSON at "canPlaceOrder" is JSON:
      """
      false
      """

  Scenario: A retired dish comes back switched off
    Given the menu item "Afang Soup" is retired
    And I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      { "isArchived": false }
      """
    Then the response status is 200
    And the response JSON at "archivedAt" is JSON:
      """
      null
      """
    And the menu shows "Afang Soup" as unavailable
    And an audit event "menu_item.restored" with outcome "SUCCESS" is recorded

  # ---------- sad paths ----------

  Scenario Outline: Only a super admin manages dishes (<who>, <action>)
    Given <session>
    When I <method> the admin path "<path>" with JSON:
      """
      <body>
      """
    Then the response status is <status>
    And the menu category "calabar_soups" lists, in order:
      | Afang Soup |
      | Edikang    |
      | Fisherman  |

    Examples:
      | who          | action | session                                         | method | path                               | body                                                | status |
      | signed out   | add    | I am not signed in                              | POST   | /menu-items                        | { "name": "Atama", "category": "calabar_soups" }    | 401    |
      | a customer   | add    | I am signed in as "ekaette@example.com"         | POST   | /menu-items                        | { "name": "Atama", "category": "calabar_soups" }    | 403    |
      | a supervisor | add    | I am signed in as the supervisor "chef@example.com" | POST | /menu-items                      | { "name": "Atama", "category": "calabar_soups" }    | 403    |
      | a supervisor | move   | I am signed in as the supervisor "chef@example.com" | POST | /menu-items/{{item:Edikang}}/move | { "direction": "up" }                               | 403    |
      | a supervisor | rename | I am signed in as the supervisor "chef@example.com" | PATCH | /menu-items/{{item:Edikang}}     | { "name": "Edikang Ikong" }                         | 403    |
      | a supervisor | retire | I am signed in as the supervisor "chef@example.com" | PATCH | /menu-items/{{item:Edikang}}     | { "isArchived": true }                              | 403    |

  Scenario Outline: A supervisor or customer cannot list dishes for editing (<who>)
    Given <session>
    When I GET the admin path "/menu-items"
    Then the response status is <status>

    Examples:
      | who          | session                                             | status |
      | signed out   | I am not signed in                                  | 401    |
      | a customer   | I am signed in as "ekaette@example.com"             | 403    |
      | a supervisor | I am signed in as the supervisor "chef@example.com" | 403    |

  Scenario Outline: Invalid new dishes are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items" with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"
    And the response JSON at "error.details" includes a field error for "<field>"
    And the menu category "calabar_soups" lists, in order:
      | Afang Soup |
      | Edikang    |
      | Fisherman  |

    Examples:
      | case                 | body                                                                     | field            |
      | no name              | { "category": "calabar_soups" }                                          | name             |
      | blank name           | { "name": "   ", "category": "calabar_soups" }                           | name             |
      | no category          | { "name": "Atama" }                                                      | category         |
      | unknown category     | { "name": "Atama", "category": "cocktails" }                             | category         |
      | zero price           | { "name": "Atama", "category": "calabar_soups", "priceKobo": 0 }         | priceKobo        |
      | fractional price     | { "name": "Atama", "category": "calabar_soups", "priceKobo": 10.5 }      | priceKobo        |
      | signature not yes/no | { "name": "Atama", "category": "calabar_soups", "isHouseSignature": "y" } | isHouseSignature |
      | client chooses slug  | { "name": "Atama", "category": "calabar_soups", "slug": "atama" }        | slug             |

  Scenario Outline: Over-long text is refused (<field>)
    Given I am signed in as the super admin "owner@example.com"
    When I add a "calabar_soups" dish with a <length>-character <field>
    Then the response status is 400
    And the response JSON at "error.details" includes a field error for "<field>"

    Examples:
      | field       | length |
      | name        | 121    |
      | description | 501    |

  Scenario Outline: A name already on the menu is refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I <method> the admin path "<path>" with JSON:
      """
      <body>
      """
    Then the response status is 409
    And the response JSON at "error.code" is "DISH_NAME_TAKEN"
    And the menu category "calabar_soups" lists, in order:
      | Afang Soup |
      | Edikang    |
      | Fisherman  |

    Examples:
      | case                 | method | path                          | body                                                   |
      | adding, other case   | POST   | /menu-items                   | { "name": "AFANG SOUP", "category": "calabar_soups" }  |
      | renaming             | PATCH  | /menu-items/{{item:Edikang}}  | { "name": "Afang Soup" }                               |

  Scenario: Bringing back a dish whose name is now used is refused
    Given the menu item "Fisherman" is retired
    And I am signed in as the super admin "owner@example.com"
    And I POST the admin path "/menu-items" with JSON:
      """
      { "name": "FISHERMAN", "category": "calabar_soups" }
      """
    When I PATCH the admin path "/menu-items/{{item:Fisherman}}" with JSON:
      """
      { "isArchived": false }
      """
    Then the response status is 409
    And the response JSON at "error.code" is "DISH_NAME_TAKEN"

  Scenario Outline: A retired dish cannot be changed until it is brought back (<who>)
    Given the menu item "Afang Soup" is retired
    And <session>
    When I PATCH the admin path "/menu-items/{{item:Afang Soup}}" with JSON:
      """
      <body>
      """
    Then the response status is 409
    And the response JSON at "error.code" is "MENU_ITEM_ARCHIVED"

    Examples:
      | who          | session                                             | body                     |
      | super admin  | I am signed in as the super admin "owner@example.com" | { "priceKobo": 1000 }  |
      | supervisor   | I am signed in as the supervisor "chef@example.com" | { "isAvailable": true }  |

  Scenario: A retired dish cannot be moved
    Given the menu item "Afang Soup" is retired
    And I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items/{{item:Afang Soup}}/move" with JSON:
      """
      { "direction": "down" }
      """
    Then the response status is 409
    And the response JSON at "error.code" is "MENU_ITEM_ARCHIVED"

  Scenario Outline: Invalid changes are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I <method> the admin path "<path>" with JSON:
      """
      <body>
      """
    Then the response status is <status>
    And the response JSON at "error.code" is "<code>"

    Examples:
      | case                         | method | path                                                  | body                                         | status | code                |
      | retire with other changes    | PATCH  | /menu-items/{{item:Edikang}}                          | { "isArchived": true, "priceKobo": 1000 }    | 400    | VALIDATION_FAILED   |
      | blank new name               | PATCH  | /menu-items/{{item:Edikang}}                          | { "name": " " }                              | 400    | VALIDATION_FAILED   |
      | unknown category             | PATCH  | /menu-items/{{item:Edikang}}                          | { "category": "cocktails" }                  | 400    | VALIDATION_FAILED   |
      | sideways                     | POST   | /menu-items/{{item:Edikang}}/move                     | { "direction": "left" }                      | 400    | VALIDATION_FAILED   |
      | move unknown dish            | POST   | /menu-items/00000000-0000-4000-8000-000000000000/move | { "direction": "up" }                        | 404    | MENU_ITEM_NOT_FOUND |
      | retire unknown dish          | PATCH  | /menu-items/00000000-0000-4000-8000-000000000000      | { "isArchived": true }                       | 404    | MENU_ITEM_NOT_FOUND |

  Scenario: A refused new dish is logged
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/menu-items" with JSON:
      """
      { "name": "Afang Soup", "category": "calabar_soups" }
      """
    Then the response status is 409
    And a "warn" log entry has:
      | outcome | FAILED |

  Scenario: The database being down gives a safe 503 and adds nothing
    Given I am signed in as the super admin "owner@example.com"
    And the database is unreachable
    When I POST the admin path "/menu-items" with JSON:
      """
      { "name": "Atama", "category": "calabar_soups" }
      """
    Then the response status is 503
    And the response body does not contain "127.0.0.1"
