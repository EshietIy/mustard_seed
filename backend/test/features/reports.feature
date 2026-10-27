Feature: Sales reports
  A super admin sees what sold in a period, to plan stock, staff and the menu: totals, the
  best-selling dishes, dishes that sold nothing, the meats chosen, sales by day, and the
  busiest hours and weekdays. Only paid orders count, on the WAT day and hour the payment
  cleared. Unpaid orders are counted separately. Supervisors, customers and signed-out callers
  may not see reports (AGENT.md 3.4).

  Background:
    Given the API is running
    And the menu contains:
      | name          | category      | price  |
      | Afang Soup    | calabar_soups | 400000 |
      | Edikang Ikong | calabar_soups | 450000 |
      | Zobo          | fresh_juices  | 80000  |
      | Garri         | swallow       | 50000  |

  # ---------- happy paths ----------

  Scenario: A super admin sees the best sellers and the totals
    Given these orders were paid:
      | paid at          | fulfilment | items                                                 |
      | 2026-10-20 13:15 | delivery   | Afang Soup x2 (Soup protein: Beef +50000), Zobo x1    |
      | 2026-10-20 19:40 | pickup     | Afang Soup x1 (Soup protein: Fish +80000)             |
      | 2026-10-22 12:05 | pickup     | Zobo x3, Edikang Ikong x1                             |
    And I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/reports/sales?from=2026-10-20&to=2026-10-22"
    Then the response status is 200
    And the response header "cache-control" is "no-store"
    And the report summary is:
      | orders           | 3       |
      | salesKobo        | 2300000 |
      | foodSalesKobo    | 2150000 |
      | deliveryFeesKobo | 150000  |
      | averageOrderKobo | 766667  |
      | itemsSold        | 8       |
      | deliveryOrders   | 1       |
      | pickupOrders     | 2       |
    And the best sellers are, in order:
      | name          | quantity | salesKobo | orders |
      | Zobo          | 4        | 320000    | 2      |
      | Afang Soup    | 3        | 1380000   | 2      |
      | Edikang Ikong | 1        | 450000    | 1      |
    And the dishes that sold nothing are "Garri"
    And the report counts the options:
      | groupName    | name | quantity | extraSalesKobo |
      | Soup protein | Beef | 2        | 100000         |
      | Soup protein | Fish | 1        | 80000          |
    And the report day "2026-10-20" has 2 orders and 1610000 kobo
    And the report day "2026-10-21" has 0 orders and 0 kobo
    And the report hour 13 has 1 order
    And the report weekday "tuesday" has 2 orders
    And an "info" log entry has:
      | event   | report.sales_viewed |
      | outcome | SUCCESS             |

  Scenario: Days start and end at midnight in Calabar
    Given these orders were paid:
      | paid at          | fulfilment | items   |
      | 2026-10-19 23:59 | pickup     | Zobo x1 |
      | 2026-10-20 00:01 | pickup     | Zobo x2 |
      | 2026-10-21 23:58 | pickup     | Zobo x3 |
      | 2026-10-22 00:00 | pickup     | Zobo x4 |
    And I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/reports/sales?from=2026-10-20&to=2026-10-21"
    Then the response status is 200
    And the best sellers are, in order:
      | name | quantity | salesKobo | orders |
      | Zobo | 5        | 400000    | 2      |
    And the report hour 0 has 1 order

  Scenario: Unpaid orders are counted apart and never as sales
    Given these orders were paid:
      | paid at          | fulfilment | items   |
      | 2026-10-20 12:00 | pickup     | Zobo x1 |
    And an order placed at "2026-10-20 12:30" ended "payment_failed"
    And an order placed at "2026-10-20 13:00" ended "payment_failed"
    And an order placed at "2026-10-20 14:00" ended "expired"
    And an order placed at "2026-10-20 15:00" ended "awaiting_payment"
    And I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/reports/sales?from=2026-10-20&to=2026-10-20"
    Then the response status is 200
    And the report summary is:
      | orders                | 1 |
      | itemsSold             | 1 |
      | unpaid.paymentFailed  | 2 |
      | unpaid.expired        | 1 |

  Scenario: Renamed and retired dishes keep their sales
    Given these orders were paid:
      | paid at          | fulfilment | items                  |
      | 2026-10-20 12:00 | pickup     | Edikang Ikong x2, Garri x1 |
    And the menu item "Edikang Ikong" is renamed "Edikang Ikong Special"
    And the menu item "Garri" is retired
    And I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/reports/sales?from=2026-10-20&to=2026-10-20"
    Then the response status is 200
    And the best sellers are, in order:
      | name                  | quantity | salesKobo | orders |
      | Edikang Ikong Special | 2        | 900000    | 1      |
      | Garri                 | 1        | 50000     | 1      |
    And the response JSON at "dishes.1.retired" is JSON:
      """
      true
      """
    And the dishes that sold nothing are "Afang Soup, Zobo"

  Scenario: A period with no sales gives zeros
    Given I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/reports/sales?from=2026-10-01&to=2026-10-07"
    Then the response status is 200
    And the report summary is:
      | orders           | 0 |
      | salesKobo        | 0 |
      | averageOrderKobo | 0 |
    And the response JSON at "days.6.date" is "2026-10-07"
    And the dishes that sold nothing are "Afang Soup, Edikang Ikong, Garri, Zobo"

  # ---------- sad paths ----------

  Scenario Outline: Only a super admin sees reports (<who>)
    Given <session>
    When I GET the admin path "/reports/sales?from=2026-10-01&to=2026-10-07"
    Then the response status is <status>

    Examples:
      | who          | session                                             | status |
      | signed out   | I am not signed in                                  | 401    |
      | a customer   | I am signed in as "ekaette@example.com"             | 403    |
      | a supervisor | I am signed in as the supervisor "chef@example.com" | 403    |

  Scenario Outline: Missing or malformed dates are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/reports/sales<query>"
    Then the response status is 400
    And the response JSON at "error.code" is "VALIDATION_FAILED"
    And the response JSON at "error.details" includes a field error for "<field>"

    Examples:
      | case            | query                               | field |
      | no dates        |                                     | from  |
      | no end          | ?from=2026-10-01                    | to    |
      | slashes         | ?from=01/10/2026&to=2026-10-07      | from  |
      | unknown field   | ?from=2026-10-01&to=2026-10-07&x=1  | x     |

  Scenario Outline: Impossible periods are refused (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/reports/sales?from=<from>&to=<to>"
    Then the response status is 400
    And the response JSON at "error.code" is "INVALID_DATE_RANGE"
    And a "warn" log entry has:
      | outcome | FAILED |

    Examples:
      | case                | from       | to         |
      | end before start    | 2026-10-07 | 2026-10-01 |
      | not a real date     | 2026-02-30 | 2026-03-01 |
      | more than 366 days  | 2025-01-01 | 2026-01-03 |

  Scenario: The database being down gives a safe 503
    Given I am signed in as the super admin "owner@example.com"
    And the database is unreachable
    When I GET the admin path "/reports/sales?from=2026-10-01&to=2026-10-07"
    Then the response status is 503
    And the response body does not contain "127.0.0.1"
