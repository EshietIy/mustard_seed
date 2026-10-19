Feature: Managing menu options
  A super admin manages option groups and options: names, rules, prices, which items
  offer them, and archiving. A supervisor can add options, price them (also per item)
  and switch them on or off, but not rename, reorder, archive or re-offer them.
  Customers and signed-out callers can do none of it (AGENT.md sections 3.4 and 14).

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name           | category      | price  |
      | Afang Soup     | calabar_soups | 400000 |
      | Fisherman Soup | calabar_soups | 600000 |
      | Zobo           | fresh_juices  | 80000  |
    And the option group "Soup protein" (choose 1 to 1) with options:
      | name    | price |
      | Chicken | 50000 |
      | Turkey  | 0     |
    And "Afang Soup" offers the "Soup protein" options
    And "Fisherman Soup" offers the "Soup protein" options

  # ---------- happy paths ----------

  Scenario: Staff can see every option group
    Given I am signed in as the supervisor "chef@example.com"
    When I GET the admin path "/option-groups"
    Then the response status is 200
    And the response lists the option groups "Soup protein"
    And the response header "cache-control" is "no-store"

  Scenario: A super admin creates an option group
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/option-groups" with JSON:
      """
      { "name": "  Extras ", "minChoices": 0, "maxChoices": 2 }
      """
    Then the response status is 201
    And the response JSON at "name" is "Extras"
    And an audit event "option_group.created" with outcome "SUCCESS" is recorded
    And an "info" log entry has:
      | event   | option_group.created |
      | outcome | SUCCESS              |

  Scenario: A new option is offered only on the items ticked in the checklist
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/option-groups/{{group:Soup protein}}/options" with JSON:
      """
      { "name": "Goat", "priceDeltaKobo": 30000, "itemIds": ["{{item:Afang Soup}}"] }
      """
    Then the response status is 201
    And an audit event "option.created" with outcome "SUCCESS" is recorded
    And the menu offers these choices on "Afang Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |
      | Soup protein | 1 to 1 | Goat    | 30000 | yes       |
    And the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |

  Scenario: A supervisor switches an option off
    Given I am signed in as the supervisor "chef@example.com"
    When I PATCH the admin path "/options/{{option:Turkey}}" with JSON:
      """
      { "isAvailable": false }
      """
    Then the response status is 200
    And the option "Turkey" has:
      | is_available | false |
    And an audit event "option.updated" with outcome "SUCCESS" is recorded
    And the menu offers these choices on "Afang Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | no        |

  Scenario: A supervisor adds a meat with its price on the soups they choose
    Given I am signed in as the supervisor "chef@example.com"
    When I POST the admin path "/option-groups/{{group:Soup protein}}/options" with JSON:
      """
      { "name": "Goat meat", "priceDeltaKobo": 90000, "itemIds": ["{{item:Afang Soup}}"] }
      """
    Then the response status is 201
    And an audit event "option.created" with outcome "SUCCESS" is recorded
    And the menu offers these choices on "Afang Soup":
      | group        | choose | name      | price | available |
      | Soup protein | 1 to 1 | Chicken   | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey    | 0     | yes       |
      | Soup protein | 1 to 1 | Goat meat | 90000 | yes       |
    And the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |

  Scenario: A supervisor re-prices a meat
    Given I am signed in as the supervisor "chef@example.com"
    When I PATCH the admin path "/options/{{option:Chicken}}" with JSON:
      """
      { "priceDeltaKobo": 70000 }
      """
    Then the response status is 200
    And the option "Chicken" has:
      | price_delta_kobo | 70000 |
    And an audit event "option.updated" with outcome "SUCCESS" is recorded

  Scenario: A supervisor sets a different price for a meat on one soup
    Given I am signed in as the supervisor "chef@example.com"
    When I PUT the admin path "/menu-items/{{item:Fisherman Soup}}/options/{{option:Chicken}}" with JSON:
      """
      { "priceDeltaKobo": 80000 }
      """
    Then the response status is 200
    And an audit event "menu_item.option_override_set" with outcome "SUCCESS" is recorded
    And the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 80000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |
    And the menu offers these choices on "Afang Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |

  Scenario: A super admin re-prices an option, and new quotes use the new price
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/options/{{option:Chicken}}" with JSON:
      """
      { "priceDeltaKobo": 70000 }
      """
    Then the response status is 200
    When I ask for a quote with:
      | fulfilment | pickup                  |
      | items      | Afang Soup (Chicken) x1 |
    Then the response JSON at "lines.0.unitPriceKobo" is JSON:
      """
      470000
      """

  Scenario: An archived option disappears from the menu
    Given I am signed in as the super admin "owner@example.com"
    When I PATCH the admin path "/options/{{option:Turkey}}" with JSON:
      """
      { "archived": true }
      """
    Then the response status is 200
    And the menu offers these choices on "Afang Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |

  Scenario: A super admin sets which option groups an item offers
    Given I am signed in as the super admin "owner@example.com"
    When I PUT the admin path "/menu-items/{{item:Zobo}}/option-groups" with JSON:
      """
      { "groupIds": ["{{group:Soup protein}}"] }
      """
    Then the response status is 200
    And the menu offers these choices on "Zobo":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |
    When I PUT the admin path "/menu-items/{{item:Zobo}}/option-groups" with JSON:
      """
      { "groupIds": [] }
      """
    Then the response status is 200
    And the menu offers no choices on "Zobo"

  Scenario: A super admin hides an option on one item, then restores it
    Given I am signed in as the super admin "owner@example.com"
    When I PUT the admin path "/menu-items/{{item:Fisherman Soup}}/options/{{option:Turkey}}" with JSON:
      """
      { "isExcluded": true }
      """
    Then the response status is 200
    And the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
    When I DELETE the admin path "/menu-items/{{item:Fisherman Soup}}/options/{{option:Turkey}}"
    Then the response status is 204
    And the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |

  # ---------- sad paths ----------

  Scenario Outline: Who may change options (<who>)
    Given <signed in>
    When I PATCH the admin path "/options/{{option:Chicken}}" with JSON:
      """
      { "sortOrder": 99 }
      """
    Then the response status is <status>
    And the option "Chicken" still has:
      | sort_order | 10 |

    Examples:
      | who          | signed in                                           | status |
      | signed out   | I am not signed in                                  | 401    |
      | a customer   | I am signed in as "ekaette@example.com"             | 403    |
      | a supervisor | I am signed in as the supervisor "chef@example.com" | 403    |

  Scenario: A supervisor cannot create option groups
    Given I am signed in as the supervisor "chef@example.com"
    When I POST the admin path "/option-groups" with JSON:
      """
      { "name": "Extras", "minChoices": 0, "maxChoices": 2 }
      """
    Then the response status is 403

  Scenario: A customer cannot even see the option list
    Given I am signed in as "ekaette@example.com"
    When I GET the admin path "/option-groups"
    Then the response status is 403

  Scenario Outline: A supervisor's <change> is refused with a clear reason
    Given I am signed in as the supervisor "chef@example.com"
    When I PATCH the admin path "/options/{{option:Turkey}}" with JSON:
      """
      { "isAvailable": false, <field> }
      """
    Then the response status is 403
    And the response JSON at "error.code" is "SUPER_ADMIN_ONLY"
    And the option "Turkey" still has:
      | is_available | true |
      | archived_at  | null |
      | sort_order   | 20   |

    Examples:
      | change  | field            |
      | rename  | "name": "Goose"  |
      | reorder | "sortOrder": 1   |
      | archive | "archived": true |

  Scenario: A supervisor cannot choose where a new meat appears
    Given I am signed in as the supervisor "chef@example.com"
    When I POST the admin path "/option-groups/{{group:Soup protein}}/options" with JSON:
      """
      { "name": "Goat meat", "sortOrder": 1 }
      """
    Then the response status is 403
    And the response JSON at "error.code" is "SUPER_ADMIN_ONLY"
    And the menu offers these choices on "Afang Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |

  Scenario: A supervisor cannot change which soups offer a meat
    Given I am signed in as the supervisor "chef@example.com"
    When I PUT the admin path "/menu-items/{{item:Fisherman Soup}}/options/{{option:Turkey}}" with JSON:
      """
      { "isExcluded": true }
      """
    Then the response status is 403
    And the response JSON at "error.code" is "SUPER_ADMIN_ONLY"
    When I DELETE the admin path "/menu-items/{{item:Fisherman Soup}}/options/{{option:Turkey}}"
    Then the response status is 403

  Scenario: A supervisor cannot re-offer a hidden meat by pricing it
    Given I am signed in as the super admin "owner@example.com"
    And I PUT the admin path "/menu-items/{{item:Fisherman Soup}}/options/{{option:Turkey}}" with JSON:
      """
      { "isExcluded": true }
      """
    And I am signed in as the supervisor "chef@example.com"
    When I PUT the admin path "/menu-items/{{item:Fisherman Soup}}/options/{{option:Turkey}}" with JSON:
      """
      { "priceDeltaKobo": 20000 }
      """
    Then the response status is 403
    And the response JSON at "error.code" is "OPTION_EXCLUDED_ON_ITEM"
    And the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |

  Scenario: Duplicate names are refused
    Given I am signed in as the super admin "owner@example.com"
    When I POST the admin path "/option-groups/{{group:Soup protein}}/options" with JSON:
      """
      { "name": " chicken " }
      """
    Then the response status is 409
    And the response JSON at "error.code" is "OPTION_NAME_TAKEN"

  Scenario Outline: Invalid changes are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I <method> the admin path "<path>" with JSON:
      """
      <body>
      """
    Then the response status is <status>
    And the response JSON at "error.code" is "<code>"

    Examples:
      | case                                  | method | path                                                           | body                                                     | status | code                   |
      | max below min                         | POST   | /option-groups                                                 | { "name": "X", "minChoices": 2, "maxChoices": 1 }        | 400    | VALIDATION_FAILED      |
      | blank name                            | POST   | /option-groups                                                 | { "name": "  ", "minChoices": 0, "maxChoices": 1 }       | 400    | VALIDATION_FAILED      |
      | negative price                        | PATCH  | /options/{{option:Chicken}}                                    | { "priceDeltaKobo": -1 }                                 | 400    | VALIDATION_FAILED      |
      | fractional price                      | PATCH  | /options/{{option:Chicken}}                                    | { "priceDeltaKobo": 10.5 }                               | 400    | VALIDATION_FAILED      |
      | nothing to change                     | PATCH  | /options/{{option:Chicken}}                                    | { }                                                      | 400    | VALIDATION_FAILED      |
      | unknown field                         | PATCH  | /options/{{option:Chicken}}                                    | { "role": "super_admin" }                                | 400    | VALIDATION_FAILED      |
      | checklist item not in group           | POST   | /option-groups/{{group:Soup protein}}/options                  | { "name": "Goat", "itemIds": ["{{item:Zobo}}"] }         | 400    | VALIDATION_FAILED      |
      | unknown option                        | PATCH  | /options/00000000-0000-4000-8000-000000000000                  | { "isAvailable": false }                                 | 404    | OPTION_NOT_FOUND       |
      | unknown group                         | PUT    | /menu-items/{{item:Zobo}}/option-groups                        | { "groupIds": ["00000000-0000-4000-8000-000000000000"] } | 404    | OPTION_GROUP_NOT_FOUND |
      | unknown item                          | PUT    | /menu-items/00000000-0000-4000-8000-000000000000/option-groups | { "groupIds": [] }                                       | 404    | MENU_ITEM_NOT_FOUND    |
      | override on an item without the group | PUT    | /menu-items/{{item:Zobo}}/options/{{option:Turkey}}            | { "isExcluded": true }                                   | 422    | OPTION_NOT_ON_ITEM     |
      | malformed id                          | PATCH  | /options/not-a-uuid                                            | { "isAvailable": false }                                 | 400    | BAD_REQUEST            |

  Scenario: Removing a special setting that doesn't exist
    Given I am signed in as the super admin "owner@example.com"
    When I DELETE the admin path "/menu-items/{{item:Afang Soup}}/options/{{option:Turkey}}"
    Then the response status is 404
    And the response JSON at "error.code" is "OPTION_OVERRIDE_NOT_FOUND"

  Scenario: The database being down gives a safe 503
    Given I am signed in as the super admin "owner@example.com"
    And the database is unreachable
    When I GET the admin path "/option-groups"
    Then the response status is 503
    And the response body does not contain "127.0.0.1"
