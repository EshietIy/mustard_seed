Feature: Server-side cart
  Each signed-in customer has one cart, stored on the server, shared by every device they
  use. It keeps item ids, choices and quantities only; prices and problems come from the live
  menu on every read. It is emptied only when a payment is verified (AGENT.md section 13).

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name       | category         | price  |
      | Afang Soup | calabar_classics | 400000 |
      | Zobo       | drinks           | 80000  |
    And the option group "Soup protein" (choose 1 to 1) with options:
      | name    | price |
      | Beef    | 0     |
      | Chicken | 50000 |
    And "Afang Soup" offers the "Soup protein" options

  # ---------- happy paths ----------

  Scenario: The same cart is visible from two devices on one account
    Given I am signed in as "ekaette@example.com" on my laptop
    And I am signed in as "ekaette@example.com" on my phone
    When on my laptop
    And I set "Afang Soup (Chicken) x2" in my cart
    Then the response status is 200
    When on my phone
    Then my cart has:
      | item                  | quantity | unit price |
      | Afang Soup (Chicken)  | 2        | 450000     |

  Scenario: Changes from two devices to different lines don't overwrite each other
    Given I am signed in as "ekaette@example.com" on my laptop
    And I am signed in as "ekaette@example.com" on my phone
    When on my laptop
    And I set "Afang Soup (Beef) x1" in my cart
    And on my phone
    And I set "Zobo x3" in my cart
    And on my laptop
    And I set "Afang Soup (Beef) x2" in my cart
    Then my cart has:
      | item              | quantity |
      | Afang Soup (Beef) | 2        |
      | Zobo              | 3        |

  Scenario: Setting a line twice is safe (set, never add)
    Given I am signed in as "ekaette@example.com"
    When I set "Zobo x3" in my cart
    And I set "Zobo x3" in my cart
    Then my cart has:
      | item | quantity |
      | Zobo | 3        |

  Scenario: The same soup with two different proteins is two lines
    Given I am signed in as "ekaette@example.com"
    When I set "Afang Soup (Beef) x1" in my cart
    And I set "Afang Soup (Chicken) x1" in my cart
    Then my cart has:
      | item                 | quantity | unit price |
      | Afang Soup (Beef)    | 1        | 400000     |
      | Afang Soup (Chicken) | 1        | 450000     |
    And my cart can be checked out

  Scenario: Removing a line and emptying the cart
    Given I am signed in as "ekaette@example.com"
    And I set "Zobo x1" in my cart
    And I set "Afang Soup (Beef) x1" in my cart
    When I remove "Zobo" from my cart
    Then the response status is 200
    And my cart has:
      | item              | quantity |
      | Afang Soup (Beef) | 1        |
    When I empty my cart
    Then my cart is empty

  Scenario: The cart survives signing out and back in
    Given I am signed in as "ekaette@example.com"
    And I set "Zobo x2" in my cart
    When I POST "/api/v1/auth/logout"
    And I am signed in as "ekaette@example.com"
    Then my cart has:
      | item | quantity |
      | Zobo | 2        |

  Scenario: A guest cart merges into the saved cart on sign-in
    Given I am signed in as "ekaette@example.com"
    And I set "Afang Soup (Beef) x2" in my cart
    When I merge my guest cart:
      | Afang Soup (Beef) x1    |
      | Afang Soup (Chicken) x1 |
      | Afang Soup x1           |
    Then the response status is 200
    And the cart response skipped 1 line
    And my cart has:
      | item                 | quantity |
      | Afang Soup (Beef)    | 3        |
      | Afang Soup (Chicken) | 1        |
    And an "info" log entry has:
      | event   | cart.merged |
      | skipped | 1           |

  # ---------- live prices and problems ----------

  Scenario: A price change is flagged until the customer accepts it
    Given I am signed in as "ekaette@example.com"
    And I set "Zobo x2" in my cart
    And the price of "Zobo" changes to 90000 kobo
    Then my cart has:
      | item | unit price | price change    |
      | Zobo | 90000      | 80000 -> 90000  |
    And my cart cannot be checked out
    When I set "Zobo x2" in my cart
    Then my cart has:
      | item | unit price | price change |
      | Zobo | 90000      |              |
    And my cart can be checked out

  Scenario: An item that sold out is flagged and blocks checkout
    Given I am signed in as "ekaette@example.com"
    And I set "Zobo x1" in my cart
    And the menu item "Zobo" is marked unavailable
    Then my cart has:
      | item | problems         |
      | Zobo | ITEM_UNAVAILABLE |
    And my cart cannot be checked out

  Scenario: A choice that is no longer offered is flagged
    Given I am signed in as "ekaette@example.com"
    And I set "Afang Soup (Beef) x1" in my cart
    And the option "Beef" is archived
    Then my cart has:
      | item       | problems                            |
      | Afang Soup | OPTION_NOT_OFFERED, OPTION_REQUIRED |

  # ---------- clearing on payment ----------

  Scenario: A verified payment empties the cart of what was ordered, keeping later additions
    Given I am signed in as "ekaette@example.com"
    And I set "Afang Soup (Chicken) x1" in my cart
    And I check out my cart for pickup
    And I set "Zobo x1" in my cart
    When I start paying for my order
    And I pay successfully on the test payment page
    Then my order status is "paid"
    And my cart has:
      | item | quantity |
      | Zobo | 1        |

  Scenario Outline: An unsuccessful payment keeps the cart (<outcome>)
    Given I am signed in as "ekaette@example.com"
    And I set "Afang Soup (Chicken) x1" in my cart
    And I check out my cart for pickup
    When I start paying for my order
    And I <action> on the test payment page
    Then my cart has:
      | item                 | quantity |
      | Afang Soup (Chicken) | 1        |

    Examples:
      | outcome  | action           |
      | declined | decline the card |
      | cancelled | cancel          |

  # ---------- sad paths ----------

  Scenario: Signing in is required
    Given I am not signed in
    When I GET "/api/v1/cart"
    Then the response status is 401

  Scenario: Another customer's line can't be touched
    Given I am signed in as "ekaette@example.com"
    And I set "Zobo x1" in my cart
    And I am signed in as "bassey@example.com"
    When I set "Afang Soup (Beef) x1" in my cart
    And I am signed in as "ekaette@example.com"
    Then my cart has:
      | item | quantity |
      | Zobo | 1        |

  Scenario Outline: Invalid lines are refused (<case>)
    Given I am signed in as "ekaette@example.com"
    And the menu item "Zobo" is marked unavailable
    When I set "<line>" in my cart
    Then the response status is <status>
    And the response JSON at "error.code" is "<code>"
    And my cart is empty

    Examples:
      | case               | line                 | status | code               |
      | required choice    | Afang Soup x1        | 422    | OPTION_REQUIRED    |
      | too many choices   | Afang Soup (Beef + Chicken) x1 | 422 | OPTION_TOO_MANY |
      | sold out           | Zobo x1              | 422    | ITEM_UNAVAILABLE   |
      | quantity too large | Zobo x21             | 400    | VALIDATION_FAILED  |

  Scenario Outline: Malformed requests are refused (<case>)
    Given I am signed in as "ekaette@example.com"
    When I send the cart line:
      """
      <body>
      """
    Then the response status is <status>
    And the response JSON at "error.code" is "<code>"

    Examples:
      | case           | body                                                                                 | status | code                |
      | zero quantity  | { "menuItemId": "00000000-0000-4000-8000-000000000001", "quantity": 0 }              | 400    | VALIDATION_FAILED   |
      | bad item id    | { "menuItemId": "nope", "quantity": 1 }                                              | 400    | VALIDATION_FAILED   |
      | unknown field  | { "menuItemId": "00000000-0000-4000-8000-000000000001", "quantity": 1, "price": 1 }  | 400    | VALIDATION_FAILED   |
      | unknown item   | { "menuItemId": "00000000-0000-4000-8000-000000000001", "quantity": 1 }              | 404    | MENU_ITEM_NOT_FOUND |

  Scenario: Removing a line that isn't in the cart
    Given I am signed in as "ekaette@example.com"
    When I DELETE the cart line "00000000-0000-4000-8000-000000000001"
    Then the response status is 404
    And the response JSON at "error.code" is "CART_LINE_NOT_FOUND"

  Scenario: The database being down gives a safe 503
    Given I am signed in as "ekaette@example.com"
    And the database is unreachable
    When I look at my cart
    Then the response status is 503
