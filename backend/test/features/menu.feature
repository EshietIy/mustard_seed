Feature: Browse the menu
  Customers see today's menu grouped into the four tabs from the design.

  Background:
    Given the API is running

  Scenario: The menu lists all four categories in display order, with items in sort order
    Given the menu contains:
      | name          | category         | sort order | house signature |
      | Afang Soup    | calabar_classics | 20         | no              |
      | Edikang Ikong | calabar_classics | 10         | yes             |
      | Zobo          | drinks           | 10         | no              |
    When I GET "/api/v1/menu"
    Then the response status is 200
    And the menu categories are, in order:
      | calabar_classics | Calabar classics |
      | swallow_sides    | Swallow & sides  |
      | continental      | Continental      |
      | drinks           | Drinks           |
    And the category "calabar_classics" lists, in order:
      | Edikang Ikong |
      | Afang Soup    |
    And the category "drinks" lists, in order:
      | Zobo |

  Scenario: A category with no items is still listed, so its tab can show "coming soon"
    Given the menu contains:
      | name          | category         |
      | Edikang Ikong | calabar_classics |
    When I GET "/api/v1/menu"
    Then the category "continental" has no items
    And the category "swallow_sides" has no items

  Scenario: An empty menu returns four empty categories, not an error
    Given the menu is empty
    When I GET "/api/v1/menu"
    Then the response status is 200
    And the category "calabar_classics" has no items
    And the category "drinks" has no items

  Scenario: Items without a price or photo come back as null placeholders
    Given the menu contains:
      | name          | category         | house signature |
      | Edikang Ikong | calabar_classics | yes             |
    When I GET "/api/v1/menu"
    Then the item "Edikang Ikong" has:
      | priceKobo        | null  |
      | image            | null  |
      | isHouseSignature | true  |
      | isAvailable      | true  |
      | isFreshJuice     | false |

  Scenario: Prices are integer kobo
    Given the menu contains:
      | name       | category         | price  |
      | Afang Soup | calabar_classics | 450000 |
    When I GET "/api/v1/menu"
    Then the item "Afang Soup" has:
      | priceKobo | 450000 |

  Scenario: An item staff marked unavailable is still listed, flagged as unavailable
    Given the menu contains:
      | name       | category         | available |
      | Afang Soup | calabar_classics | no        |
    When I GET "/api/v1/menu"
    Then the item "Afang Soup" has:
      | isAvailable | false |

  Scenario: Fresh juices are flagged for the juice band
    Given the menu contains:
      | name               | category | fresh juice |
      | Pineapple & ginger | drinks   | yes         |
    When I GET "/api/v1/menu"
    Then the item "Pineapple & ginger" has:
      | isFreshJuice | true |

  Scenario: Image URLs are built from config and the stored key, never stored as URLs
    Given the menu contains:
      | name          | category         | image                     |
      | Edikang Ikong | calabar_classics | menu/edikang-ikong/v1     |
    When I GET "/api/v1/menu"
    Then the item "Edikang Ikong" image URLs start with the Supabase public URL for "menu/edikang-ikong/v1"

  Scenario: Internal columns are never exposed
    Given the menu contains:
      | name          | category         | image                 |
      | Edikang Ikong | calabar_classics | menu/edikang-ikong/v1 |
    When I GET "/api/v1/menu"
    Then the item "Edikang Ikong" has exactly the fields:
      | id               |
      | slug             |
      | name             |
      | description      |
      | priceKobo        |
      | isHouseSignature |
      | isFreshJuice     |
      | isAvailable      |
      | image            |

  Scenario: The database is unavailable
    Given the database is unreachable
    When I GET "/api/v1/menu"
    Then the response status is 503
    And the response JSON at "error.code" is "SERVICE_UNAVAILABLE"
    And the response JSON at "error.message" is "The service is temporarily unavailable. Please try again."
    And the response body does not contain "127.0.0.1"
    And the response body does not contain "fetch"
    And an "error" log entry has:
      | upstream  | supabase        |
      | operation | menu_items.list |
      | outcome   | FAILED          |

  Scenario: The menu is only served under the versioned prefix
    When I GET "/api/menu"
    Then the response status is 404
