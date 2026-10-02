Feature: Place an order
  Signed-in customers order food and drinks for delivery in Calabar or pickup.
  The server computes every total from the menu; orders wait for payment before
  they reach the kitchen.

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name          | category         | price  | available |
      | Edikang Ikong | calabar_classics | 450000 | yes       |
      | Afang Soup    | calabar_classics | 400000 | yes       |
      | Atama Soup    | calabar_classics |        | yes       |
      | Zobo          | drinks           | 80000  | yes       |

  # ---------- quote ----------

  Scenario: A quote shows server-computed totals before checkout
    When I ask for a quote with:
      | fulfilment | delivery                     |
      | items      | Edikang Ikong x2, Zobo x3    |
    Then the response status is 200
    And the response JSON at "subtotalKobo" is JSON:
      """
      1140000
      """
    And the response JSON at "deliveryFeeKobo" is JSON:
      """
      150000
      """
    And the response JSON at "totalKobo" is JSON:
      """
      1290000
      """
    And the response JSON at "canPlaceOrder" is JSON:
      """
      true
      """

  Scenario: A quote explains why an order can't be placed
    Given the time in Calabar is "22:45"
    When I ask for a quote with:
      | fulfilment | pickup        |
      | items      | Atama Soup x1 |
    Then the response status is 200
    And the response JSON at "canPlaceOrder" is JSON:
      """
      false
      """
    And the response JSON at "problems.0.code" is "ORDERING_CLOSED"
    And the response JSON at "problems.1.code" is "ITEM_PRICE_UNAVAILABLE"

  # ---------- happy paths ----------

  Scenario: A customer places a delivery order in Calabar
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | fulfilment | delivery                  |
      | items      | Edikang Ikong x2, Zobo x1 |
      | name       | Ekaette Bassey            |
      | phone      | 0803 123 4567             |
      | address    | 12 Marian Road            |
    Then the response status is 201
    And the response JSON at "orderNumber" matches "^#MS-\d{4,}$"
    And the response JSON at "status" is "awaiting_payment"
    And the response JSON at "subtotalKobo" is JSON:
      """
      980000
      """
    And the response JSON at "deliveryFeeKobo" is JSON:
      """
      150000
      """
    And the response JSON at "totalKobo" is JSON:
      """
      1130000
      """
    And the response JSON at "contact.phone" is "+2348031234567"
    And the response JSON at "delivery" is JSON:
      """
      { "streetAddress": "12 Marian Road", "city": "Calabar" }
      """
    And the response does not reveal the tracking token
    And the stored order has:
      | status            | awaiting_payment |
      | fulfilment        | delivery         |
      | total_kobo        | 1130000          |
      | delivery_fee_kobo | 150000           |
      | branch_id         | calabar          |
    And an audit event "order.created" with outcome "SUCCESS" is recorded
    And that audit event carries the request id
    And an "info" log entry has:
      | event            | order.created             |
      | outcome          | SUCCESS                   |
      | amountKobo       | 1130000                   |
      | statusTransition | none -> awaiting_payment  |

  Scenario: A customer places a pickup order with no delivery fee
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | fulfilment | pickup    |
      | items      | Zobo x2   |
    Then the response status is 201
    And the response JSON at "deliveryFeeKobo" is JSON:
      """
      0
      """
    And the response JSON at "totalKobo" is JSON:
      """
      160000
      """
    And the response JSON at "delivery" is JSON:
      """
      null
      """

  Scenario: Order numbers increase and are never reused
    Given I am signed in as "ekaette@example.com"
    When I place an order
    Then the response status is 201
    When I place an order
    Then the response status is 201
    And there are 2 orders in the database

  Scenario: The customer can view their own order
    Given I am signed in as "ekaette@example.com"
    When I place an order
    And I fetch that order
    Then the response status is 200
    And the response JSON at "status" is "awaiting_payment"
    And the response header "cache-control" is "no-store"

  # ---------- idempotency ----------

  Scenario: Submitting the same checkout twice returns the same order
    Given I am signed in as "ekaette@example.com"
    When I place an order
    Then the response status is 201
    When I submit the same order again
    Then the response status is 200
    And there is 1 order in the database
    And an "info" log entry has:
      | event | order.replayed |

  Scenario: Two simultaneous submits create only one order
    Given I am signed in as "ekaette@example.com"
    When I submit the same order twice at the same time
    Then there is 1 order in the database

  # ---------- business-rule violations ----------

  Scenario Outline: Ordering outside online hours is refused
    Given I am signed in as "ekaette@example.com"
    And I prepare an order with:
      | items | Zobo x1 |
    And the time in Calabar is "<time>"
    When I submit the prepared order
    Then the response status is 422
    And the response JSON at "error.code" is "ORDERING_CLOSED"
    And the response JSON at "error.message" is "Online orders are open 8am – 10:30pm. Please come back then."
    And there are 0 orders in the database
    And an audit event "order.create" with outcome "FAILED" is recorded
    And that audit event has error code "ORDERING_CLOSED"
    And a "warn" log entry has:
      | errorCode | ORDERING_CLOSED |

    Examples:
      | time  |
      | 07:59 |
      | 22:30 |
      | 23:45 |

  Scenario: The last minute before the cut-off is still open
    Given I am signed in as "ekaette@example.com"
    And the time in Calabar is "22:29"
    When I place an order
    Then the response status is 201

  Scenario: An item that sold out between adding and checkout
    Given I am signed in as "ekaette@example.com"
    And I prepare an order with:
      | items | Afang Soup x1, Zobo x1 |
    And the menu item "Afang Soup" is marked unavailable
    When I submit the prepared order
    Then the response status is 422
    And the response JSON at "error.code" is "ITEM_UNAVAILABLE"
    And the response JSON at "error.message" is "Afang Soup has just sold out."
    And there are 0 orders in the database

  Scenario: An item without a real price can't be ordered
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | items          | Atama Soup x1 |
      | expected total | 150000        |
    Then the response status is 422
    And the response JSON at "error.code" is "ITEM_PRICE_UNAVAILABLE"

  Scenario: An empty cart
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | items          |        |
      | expected total | 150000 |
    Then the response status is 422
    And the response JSON at "error.code" is "EMPTY_CART"

  Scenario: Delivery outside Calabar
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | city | Uyo |
    Then the response status is 422
    And the response JSON at "error.code" is "DELIVERY_AREA_NOT_SERVED"
    And an audit event "order.create" with outcome "FAILED" is recorded
    And that audit event has error code "DELIVERY_AREA_NOT_SERVED"

  Scenario: The Uyo branch is not taking online orders yet
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | branch     | uyo    |
      | fulfilment | pickup |
    Then the response status is 422
    And the response JSON at "error.code" is "BRANCH_NOT_ACCEPTING_ORDERS"
    And the response JSON at "error.message" is "Online ordering is coming soon for Uyo."

  Scenario: Prices changed after the customer saw the total
    Given I am signed in as "ekaette@example.com"
    And I prepare an order with:
      | items | Edikang Ikong x1 |
    And the price of "Edikang Ikong" changes to 500000 kobo
    When I submit the prepared order
    Then the response status is 409
    And the response JSON at "error.code" is "PRICE_CHANGED"
    And the response JSON at "error.details.totalKobo" is JSON:
      """
      650000
      """
    And there are 0 orders in the database
    And an audit event "order.create" with outcome "FAILED" is recorded
    And that audit event has error code "PRICE_CHANGED"

  Scenario: A client-supplied total that doesn't match is refused, never trusted
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | items          | Edikang Ikong x1 |
      | expected total | 100              |
    Then the response status is 409
    And there are 0 orders in the database

  # ---------- validation ----------

  Scenario Outline: Invalid checkout details give field-level errors
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | <setting> | <value> |
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"
    And the response JSON at "error.details" includes a field error for "<field>"

    Examples:
      | setting | value      | field                  |
      | phone   | 12345      | contact.phone          |
      | phone   | +447911123 | contact.phone          |
      | name    | A          | contact.fullName       |
      | address | <none>     | delivery.streetAddress |
      | address | 12         | delivery.streetAddress |

  Scenario: Pickup orders must not carry a delivery address
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | fulfilment | pickup         |
      | address    | 12 Marian Road |
    Then the response status is 400
    And the response JSON at "error.details" includes a field error for "delivery"

  Scenario: The same item twice in one order
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | items | Zobo x1, Zobo x2 |
    Then the response status is 400
    And the response JSON at "error.details" includes a field error for "items"

  Scenario: A quantity above the limit
    Given I am signed in as "ekaette@example.com"
    When I place an order with:
      | items          | Zobo x21 |
      | expected total | 1        |
    Then the response status is 400
    And the response JSON at "error.details" includes a field error for "items.0.quantity"

  Scenario: Client-supplied prices or status are rejected
    Given I am signed in as "ekaette@example.com"
    When I send the order body:
      """
      { "fulfilment": "pickup", "branchId": "calabar", "items": [], "contact": { "fullName": "Ada", "phone": "08031234567" },
        "expectedTotalKobo": 1, "clientRequestId": "7c8a3d2e-1b4f-4a6c-9d8e-0f1a2b3c4d5e", "status": "paid", "totalKobo": 1 }
      """
    Then the response status is 400
    And the response JSON at "error.details" includes a field error for "status"
    And the response JSON at "error.details" includes a field error for "totalKobo"

  # ---------- access ----------

  Scenario: Ordering requires sign-in
    When I place an order
    Then the response status is 401
    And there are 0 orders in the database

  Scenario: Another customer's order is not visible
    Given I am signed in as "ekaette@example.com"
    When I place an order
    And I fetch that order
    Then the response status is 200
    Given I am signed in as "someone-else@example.com"
    When I fetch the order placed earlier
    Then the response status is 404
    And the response JSON at "error.code" is "ORDER_NOT_FOUND"

  Scenario: Placing orders is rate limited
    Given the API is running with:
      | THROTTLE_STRICT_LIMIT | 2 |
    And I am signed in as "ekaette@example.com"
    When I place an order
    And I place an order
    Then the response status is 201
    When I place an order
    Then the response status is 429
    And the response header "retry-after" is a positive integer

  # ---------- upstream failure ----------

  Scenario: The database is unavailable while placing an order
    Given I am signed in as "ekaette@example.com"
    And I prepare an order with:
      | items | Zobo x1 |
    And the database is unreachable
    When I submit the prepared order
    Then the response status is 503
    And the response JSON at "error.code" is "SERVICE_UNAVAILABLE"
    And there are 0 orders in the database
