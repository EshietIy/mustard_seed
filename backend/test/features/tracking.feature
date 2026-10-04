Feature: Track an order
  The confirmation email links to a live status page. The link carries an unguessable
  tracking token, which is the only credential: no sign-in is needed, and the order
  number or id never works in its place.

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name          | category         | price  | available |
      | Edikang Ikong | calabar_classics | 450000 | yes       |
      | Zobo          | drinks           | 80000  | yes       |
    And I am signed in as "ekaette@example.com"

  # ---------- happy paths ----------

  Scenario: Anyone with the link sees a delivery order's status and details
    Given I place an order with:
      | fulfilment | delivery                  |
      | items      | Edikang Ikong x2, Zobo x1 |
      | name       | Ekaette Bassey            |
      | phone      | 0803 123 4567             |
      | address    | 12 Marian Road            |
    And I am not signed in
    When I track my order with the link from the email
    Then the response status is 200
    And the response JSON at "orderNumber" matches "^#MS-\d{4,}$"
    And the response JSON at "status" is "awaiting_payment"
    And the response JSON at "fulfilment" is "delivery"
    And the response JSON at "totalKobo" is JSON:
      """
      1130000
      """
    And the response JSON at "contact" is JSON:
      """
      { "fullName": "Ekaette Bassey", "phone": "+2348031234567" }
      """
    And the response JSON at "delivery" is JSON:
      """
      { "streetAddress": "12 Marian Road", "city": "Calabar" }
      """
    And the response JSON at "id" is absent
    And the response does not reveal the tracking token
    And the response header "cache-control" is "no-store"
    And no log entry contains the tracking token

  Scenario: A paid pickup order shows it was paid and when it will be ready
    Given I have placed an order and started paying
    And I pay successfully on the test payment page
    And my order status is "paid"
    When I track my order with the link from the email
    Then the response status is 200
    And the response JSON at "status" is "paid"
    And the response JSON at "fulfilment" is "pickup"
    And the response JSON at "delivery" is JSON:
      """
      null
      """
    And the response JSON at "estimatedReadyAt" matches "^\d{4}-\d{2}-\d{2}T"
    And the response JSON at "payment.status" is "success"

  # ---------- sad paths ----------

  Scenario: An unknown token finds nothing and is logged without the token
    When I track an order with an unknown token
    Then the response status is 404
    And the response JSON at "error.code" is "ORDER_NOT_FOUND"
    And a "warn" log entry has:
      | errorCode | ORDER_NOT_FOUND |
      | outcome   | FAILED          |
    And no log entry contains the tracking token

  Scenario Outline: A malformed token finds nothing
    When I track an order with the token "<token>"
    Then the response status is 404
    And the response JSON at "error.code" is "ORDER_NOT_FOUND"

    Examples:
      | token                                         |
      | short                                         |
      | !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! |
      | ' OR '1'='1                                   |

  Scenario Outline: The order's <what> can't be used instead of the token
    Given I place an order
    When I try to track my order by its <what>
    Then the response status is 404
    And the response JSON at "error.code" is "ORDER_NOT_FOUND"

    Examples:
      | what         |
      | id           |
      | order number |

  Scenario: The database being down gives a safe 503
    Given the database is unreachable
    When I track an order with an unknown token
    Then the response status is 503
    And the response body does not contain "127.0.0.1"
    And no log entry contains the tracking token

  Scenario: Tracking is rate limited
    Given the API is running with:
      | THROTTLE_LIMIT  | 2     |
      | THROTTLE_TTL_MS | 60000 |
    When I track an order with an unknown token
    And I track an order with an unknown token
    And I track an order with an unknown token
    Then the response status is 429
    And the response header "retry-after" is a positive integer
