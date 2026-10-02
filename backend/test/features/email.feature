Feature: Order confirmation email
  When an order's payment clears, the customer gets one confirmation email (Mailgun in real
  environments; an in-memory mailbox here). Email never blocks or undoes the payment.

  Background:
    Given the API is running
    And the time in Calabar is "12:00"
    And the menu contains:
      | name | category | price | fresh juice |
      | Zobo | drinks   | 80000 | yes         |
    And I am signed in as "ekaette@example.com"

  Scenario: A successful payment sends one confirmation email
    Given I have placed an order and started paying
    When I pay successfully on the test payment page
    Then my order status is "paid"
    And a confirmation email is sent to "ekaette@example.com"
    And the email has:
      | subject matches | Payment received — your Mustard Seed order #MS-\d{4,} |
    And the confirmation email is recorded as "sent" after 1 attempt
    And an audit event "email.order_confirmation" with outcome "SUCCESS" is recorded
    And an "info" log entry has:
      | event           | email.sent   |
      | outcome         | SENT         |
      | recipientDomain | example.com  |
    And no log entry contains "ekaette@example.com" in full

  Scenario: The email shows the order, totals and pickup details
    Given I have placed an order and started paying
    When I pay successfully on the test payment page
    Then a confirmation email is sent to "ekaette@example.com"
    And the email has:
      | from          | Mustard Seed Restaurant & Bar <orders@mustardseed.ng> |
      | text contains | Amedi, Ekaette! Your order is in the kitchen.          |
      | text contains | 2× Zobo (Fresh, no preservatives) — ₦1,600             |
      | text contains | Total paid: ₦1,600                                     |
      | text contains | Ready for pickup by: 12:30pm                           |
      | text contains | PICK UP AT                                             |
      | text contains | [CALABAR ADDRESS]                                      |
      | html contains | Track your order live                                  |
    And the email links to the tracking page with the order token
    And the order has an estimated time 30 minutes after payment

  Scenario: A duplicate webhook does not send a second email
    Given I have placed an order and started paying
    When the payment gateway reports the payment as "success"
    And the simulator sends the webhook 3 times
    And I return from the payment page
    And the email dispatcher runs
    Then exactly 1 confirmation email has been sent

  Scenario Outline: A <what> payment sends no email
    Given I have placed an order and started paying
    When I <action> on the test payment page
    And I return from the payment page
    And the email dispatcher runs
    Then no confirmation email is queued or sent

    Examples:
      | what      | action           |
      | declined  | decline the card |
      | cancelled | cancel           |

  Scenario: If Mailgun fails, the order stays paid and the email is retried later
    Given the mail provider fails the next 1 send
    And I have placed an order and started paying
    When I pay successfully on the test payment page
    Then my order status is "paid"
    And the confirmation email is recorded as "pending" after 1 attempt
    And the next email attempt is scheduled 1 minute later
    And an audit event "email.order_confirmation" with outcome "FAILED" is recorded
    And that audit event has error code "EMAIL_SEND_FAILED"
    And a "warn" log entry has:
      | event     | email.send_failed |
      | willRetry | true              |
    And exactly 0 confirmation emails have been sent
    Given 1 minutes pass
    When the email dispatcher runs
    Then the confirmation email is recorded as "sent" after 2 attempts
    And exactly 1 confirmation email has been sent
    When I return from the payment page
    Then the response JSON at "status" is "paid"

  Scenario: After the maximum attempts the email is marked failed and flagged for staff
    Given the API is running with:
      | EMAIL_MAX_ATTEMPTS | 2 |
    And the time in Calabar is "12:00"
    And I am signed in as "ekaette@example.com"
    And the mail provider fails the next 5 sends
    And I have placed an order and started paying
    When I pay successfully on the test payment page
    Then the confirmation email is recorded as "pending" after 1 attempt
    Given 1 minutes pass
    When the email dispatcher runs
    Then the confirmation email is recorded as "failed" after 2 attempts
    And my order status is "paid"
    And an "error" log entry has:
      | event     | email.send_failed |
      | willRetry | false             |
