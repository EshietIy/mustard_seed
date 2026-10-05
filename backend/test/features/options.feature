Feature: Menu option groups
  Items can carry choices such as a soup protein (AGENT.md section 14). Options are data,
  priced by the server as base price + option price differences, and each order line keeps
  a snapshot of the choices, so later menu edits never change a placed order.

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name           | category         | price  |
      | Afang Soup     | calabar_classics | 400000 |
      | Fisherman Soup | calabar_classics | 600000 |
      | Zobo           | drinks           | 80000  |
    And the option group "Soup protein" (choose 1 to 1) with options:
      | name    | price |
      | Beef    | 0     |
      | Chicken | 50000 |
      | Turkey  | 0     |
    And "Afang Soup" offers the "Soup protein" options
    And "Fisherman Soup" offers the "Soup protein" options
    And "Fisherman Soup" does not offer "Beef"

  # ---------- menu ----------

  Scenario: The menu lists each item's choices, leaving out excluded ones
    Then the menu offers these choices on "Afang Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Beef    | 0     | yes       |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |
    And the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |
    And the menu offers no choices on "Zobo"

  Scenario: A switched-off option is shown as unavailable; an archived one disappears
    Given the option "Turkey" is switched off
    And the option "Beef" is archived
    Then the menu offers these choices on "Afang Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 50000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | no        |

  Scenario: An item can charge a different price for an option
    Given "Chicken" costs 20000 kobo extra on "Fisherman Soup"
    Then the menu offers these choices on "Fisherman Soup":
      | group        | choose | name    | price | available |
      | Soup protein | 1 to 1 | Chicken | 20000 | yes       |
      | Soup protein | 1 to 1 | Turkey  | 0     | yes       |

  # ---------- happy paths ----------

  Scenario: A customer orders a soup with a protein, priced by the server
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | fulfilment | pickup                                 |
      | items      | Afang Soup (Chicken) x2, Zobo x1        |
    Then the response status is 201
    And the order lines are:
      | item       | quantity | unit price | choices |
      | Afang Soup | 2        | 450000     | Chicken |
      | Zobo       | 1        | 80000      |         |
    And the response JSON at "totalKobo" is JSON:
      """
      980000
      """
    And the response JSON at "items.0.options.0.groupName" is "Soup protein"
    And the response JSON at "items.0.options.0.priceDeltaKobo" is JSON:
      """
      50000
      """
    And the response JSON at "items.0.options.0.optionId" is a UUID

  Scenario: The same soup with two different proteins is two lines
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | fulfilment | pickup                                       |
      | items      | Afang Soup (Beef) x1, Afang Soup (Chicken) x1 |
    Then the response status is 201
    And the order lines are:
      | item       | quantity | unit price | choices |
      | Afang Soup | 1        | 400000     | Beef    |
      | Afang Soup | 1        | 450000     | Chicken |

  Scenario: The quote prices options and explains a missing choice
    When I ask for a quote with:
      | fulfilment | pickup                       |
      | items      | Afang Soup x1, Fisherman Soup (Turkey) x1 |
    Then the response status is 200
    And the response JSON at "canPlaceOrder" is JSON:
      """
      false
      """
    And the response JSON at "problems.0.code" is "OPTION_REQUIRED"
    And the response JSON at "problems.0.lineIndex" is JSON:
      """
      0
      """
    And the response JSON at "problems.0.message" is "Choose a soup protein for Afang Soup."
    And the response JSON at "lines.1.unitPriceKobo" is JSON:
      """
      600000
      """

  # ---------- sad paths ----------

  Scenario: A soup with no protein is refused
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | fulfilment     | pickup        |
      | items          | Afang Soup x1 |
      | expected total | 400000        |
    Then the response status is 422
    And the response JSON at "error.code" is "OPTION_REQUIRED"
    And the option problem is "OPTION_REQUIRED" on line 1 for the "Soup protein" group
    And there are 0 orders in the database
    And an audit event "order.create" with outcome "FAILED" is recorded
    And that audit event has error code "OPTION_REQUIRED"

  Scenario: Two proteins on a single-choice group is refused
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | fulfilment     | pickup                         |
      | items          | Afang Soup (Beef + Chicken) x1 |
      | expected total | 450000                         |
    Then the response status is 422
    And the option problem is "OPTION_TOO_MANY" on line 1 for the "Soup protein" group

  Scenario Outline: An option the item doesn't offer is refused (<case>)
    Given I am signed in as "ekaette@example.com"
    And <setup>
    When I place an order with:
      | fulfilment     | pickup  |
      | items          | <items> |
      | expected total | 1       |
    Then the response status is 422
    And the response JSON at "error.code" is "<code>"
    And the option problem is "<code>" on line 1

    Examples:
      | case                         | setup                                       | items                         | code               |
      | excluded on this item        | the menu is as above                        | Fisherman Soup (Beef) x1      | OPTION_NOT_OFFERED |
      | belongs to another item      | the menu is as above                        | Zobo (Chicken) x1             | OPTION_NOT_OFFERED |
      | archived                     | the option "Beef" is archived               | Afang Soup (Beef) x1          | OPTION_NOT_OFFERED |
      | switched off by staff        | the option "Turkey" is switched off         | Afang Soup (Turkey) x1        | OPTION_UNAVAILABLE |

  Scenario: Option ids must be well-formed
    Given I am signed in as "ekaette@example.com"
    When I send the order body:
      """
      { "fulfilment": "pickup", "branchId": "calabar", "items": [{ "menuItemId": "00000000-0000-4000-8000-000000000001", "quantity": 1, "optionIds": ["not-a-uuid"] }], "contact": { "fullName": "Ekaette Bassey", "phone": "0803 123 4567" }, "expectedTotalKobo": 1, "clientRequestId": "11111111-1111-4111-8111-111111111111" }
      """
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"

  # ---------- snapshots ----------

  Scenario: A placed order keeps its choices after the menu changes
    Given I am signed in as "ekaette@example.com"
    And I place an order with:
      | fulfilment | pickup                  |
      | items      | Afang Soup (Chicken) x1 |
    When the option "Chicken" is renamed "Hen" and costs 90000 kobo extra
    And the option "Hen" is archived
    And I fetch the order placed earlier
    Then the response status is 200
    And the order lines are:
      | item       | quantity | unit price | choices |
      | Afang Soup | 1        | 450000     | Chicken |

  Scenario: The confirmation email shows the chosen protein
    Given I am signed in as "ekaette@example.com"
    And I place an order with:
      | fulfilment | pickup                  |
      | items      | Afang Soup (Chicken) x1 |
    When I start paying for my order
    And I pay successfully on the test payment page
    Then my order status is "paid"
    And a confirmation email is sent to "ekaette@example.com"
    And the email has:
      | text contains | 1× Afang Soup (Chicken) |
