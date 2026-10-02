Feature: Pay for an order
  Customers pay online through Paystack (here: the built-in Paystack Simulator, reached over
  HTTP exactly like the real API). An order reaches the kitchen ("paid") only after the
  payment is confirmed by a signed webhook or a server-side verification with a matching
  amount. Unpaid orders expire after 15 minutes.

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name | category | price |
      | Zobo | drinks   | 80000 |
    And I am signed in as "ekaette@example.com"

  # ---------- happy path ----------

  Scenario: Paying successfully marks the order paid and sends it to the kitchen
    Given I have placed an order and started paying
    Then the response JSON at "authorizationUrl" matches "/simulator/paystack/checkout/"
    And the response JSON at "reference" matches "^MS\d{4}-"
    And the test payment page shows the amount "₦1,600"
    When I pay successfully on the test payment page
    Then I am sent back to the site with the payment reference
    And my order status is "paid"
    And the payment status is "success"
    And the audit trail has 1 "order.paid" event for my order
    And an "info" log entry has:
      | event            | payment.result           |
      | source           | webhook                  |
      | statusTransition | awaiting_payment -> paid |
    And an "info" log entry has:
      | event          | payment.webhook |
      | signatureValid | true            |
    When I return from the payment page
    Then the response status is 200
    And the response JSON at "status" is "paid"
    And the response JSON at "payment.status" is "success"
    And the response JSON at "payment.channel" is "card"

  Scenario: Returning before the webhook arrives still confirms the payment server-side
    Given I have placed an order and started paying
    When the payment gateway reports the payment as "success"
    And I return from the payment page
    Then the response JSON at "status" is "paid"
    And an "info" log entry has:
      | event  | payment.result |
      | source | verify         |

  Scenario: Pressing "Pay now" again reuses the same payment
    Given I have placed an order and started paying
    When I start paying for the order placed earlier
    Then the response status is 201
    And the response gives the same payment link as before
    And there is exactly one payment for my order

  # ---------- failed, cancelled, pending ----------

  Scenario Outline: A <what> payment fails the order; nothing reaches the kitchen
    Given I have placed an order and started paying
    When I <action> on the test payment page
    Then I am sent back to the site with the payment reference
    When I return from the payment page
    Then the response JSON at "status" is "payment_failed"
    And my order status is "payment_failed"
    And the audit trail has 0 "order.paid" events for my order
    And the audit trail has 1 "payment.failed" event for my order
    And a "warn" log entry has:
      | event     | payment.result |
      | errorCode | <code>         |

    Examples:
      | what      | action           | code              |
      | declined  | decline the card | PAYMENT_FAILED    |
      | cancelled | cancel           | PAYMENT_ABANDONED |

  Scenario: A failed order cannot be paid again
    Given I have placed an order and started paying
    When I decline the card on the test payment page
    And I return from the payment page
    And I start paying for the order placed earlier
    Then the response status is 409
    And the response JSON at "error.code" is "ORDER_NOT_PAYABLE"

  Scenario: A pending payment leaves the order waiting
    Given I have placed an order and started paying
    When I leave the payment pending on the test payment page
    And I return from the payment page
    Then the response JSON at "status" is "awaiting_payment"
    And the response JSON at "payment.status" is "ongoing"
    And my order status is "awaiting_payment"

  # ---------- webhooks ----------

  Scenario: A duplicate webhook is processed only once
    Given I have placed an order and started paying
    When the payment gateway reports the payment as "success"
    And the simulator sends the webhook 3 times
    Then the webhook deliveries were answered with:
      | 200 |
      | 200 |
      | 200 |
    And my order status is "paid"
    And the audit trail has 1 "order.paid" event for my order
    And there is exactly one payment for my order

  Scenario Outline: A webhook with <problem> is rejected and logged
    Given I have placed an order and started paying
    When the payment gateway reports the payment as "success"
    And the simulator sends the webhook with <problem>
    Then the webhook deliveries were answered with:
      | 401 |
    And my order status is "awaiting_payment"
    And a "warn" log entry has:
      | event          | payment.webhook   |
      | signatureValid | false             |
      | errorCode      | INVALID_SIGNATURE |

    Examples:
      | problem         |
      | a bad signature |
      | no signature    |

  Scenario: A signed webhook with the wrong amount is rejected and logged
    Given I have placed an order and started paying
    When the payment gateway reports the payment as "success"
    And the simulator sends the webhook with the amount 100
    Then the webhook deliveries were answered with:
      | 422 |
    And my order status is "awaiting_payment"
    And an "error" log entry has:
      | event     | payment.result  |
      | errorCode | AMOUNT_MISMATCH |
    And an audit event "payment.success" with outcome "FAILED" is recorded
    And that audit event has error code "AMOUNT_MISMATCH"

  # ---------- expiry ----------

  Scenario: An order not paid within 15 minutes expires
    Given I have placed an order and started paying
    And 16 minutes pass
    When the payment expiry sweep runs
    Then my order status is "expired"
    And the audit trail has 1 "order.expired" event for my order

  Scenario: An order inside its payment window is left alone
    Given I have placed an order and started paying
    And 14 minutes pass
    When the payment expiry sweep runs
    Then my order status is "awaiting_payment"

  Scenario: The sweep finds a payment that did go through and marks it paid instead of expiring
    Given I have placed an order and started paying
    And the payment gateway reports the payment as "success"
    And 16 minutes pass
    When the payment expiry sweep runs
    Then my order status is "paid"
    And an "info" log entry has:
      | event  | payment.result |
      | source | sweep          |

  Scenario: A payment that arrives after expiry is still cooked (owner's rule), and flagged
    Given I have placed an order and started paying
    And 16 minutes pass
    When the payment expiry sweep runs
    Then my order status is "expired"
    When the customer completes the payment late
    Then my order status is "paid"
    And a "warn" log entry has:
      | event          | payment.late |
      | previousStatus | expired      |

  Scenario: Paying after the window has passed is refused
    Given I have placed an order and started paying
    And 16 minutes pass
    When I start paying for the order placed earlier
    Then the response status is 409
    And the response JSON at "error.code" is "ORDER_EXPIRED"
    And my order status is "expired"

  # ---------- gateway problems ----------

  Scenario Outline: Paystack failing on "Pay now" leaves the order waiting
    Given I place an order with:
      | items | Zobo x1 |
    And the payment gateway fails the next request with <status>
    When I start paying for my order
    Then the response status is 503
    And the response JSON at "error.code" is "SERVICE_UNAVAILABLE"
    And my order status is "awaiting_payment"
    And an "error" log entry has:
      | event     | payment.gateway_call |
      | operation | initialize           |
      | outcome   | FAILED               |
    And an audit event "payment.initialize" with outcome "FAILED" is recorded

    Examples:
      | status |
      | 500    |
      | 502    |
      | 503    |

  Scenario: Paystack timing out leaves the order waiting
    Given the API is running with:
      | PAYSTACK_TIMEOUT_MS | 1000 |
    And I am signed in as "ekaette@example.com"
    And I place an order with:
      | items | Zobo x1 |
    And the payment gateway takes 1500 ms to answer
    When I start paying for my order
    Then the response status is 503
    And my order status is "awaiting_payment"

  Scenario: Verification while Paystack is down changes nothing and can be retried
    Given I have placed an order and started paying
    And the payment gateway reports the payment as "success"
    And the payment gateway fails the next request with 503
    When I return from the payment page
    Then the response status is 503
    And my order status is "awaiting_payment"
    When I return from the payment page
    Then the response JSON at "status" is "paid"

  # ---------- access ----------

  Scenario: Paying requires sign-in and your own order
    Given I place an order with:
      | items | Zobo x1 |
    And I am signed in as "someone-else@example.com"
    When I start paying for my order
    Then the response status is 404
    Given I am not signed in
    When I start paying for my order
    Then the response status is 401

  Scenario: Verifying an unknown reference
    When I verify the payment reference "MS9999-unknown"
    Then the response status is 404
