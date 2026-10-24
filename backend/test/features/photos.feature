Feature: Dish photos
  A super admin uploads a photo for a dish. The backend checks the file by its contents
  (JPEG, PNG or WebP only), converts it to a small WebP thumbnail for lists and a full size
  for detail views, and stores only those. Replacing or removing a photo deletes the old files.
  A failure part-way leaves no stray file and keeps the earlier photo (AGENT.md 3.1, 5).

  Background:
    Given the API is running
    And the menu contains:
      | name       | category      | price  |
      | Afang Soup | calabar_soups | 400000 |
      | Zobo       | fresh_juices  | 80000  |

  # ---------- happy paths ----------

  Scenario Outline: A super admin uploads a <kind> photo
    Given I am signed in as the super admin "owner@example.com"
    When I upload a <kind> file named "<file>" as the photo of "{{item:Afang Soup}}"
    Then the response status is 201
    And photo storage holds a WebP thumbnail and full size for "Afang Soup"
    And photo storage holds 2 files
    And the menu shows the uploaded photo for "Afang Soup"
    And the menu shows no photo for "Zobo"
    And the response header "cache-control" is "no-store"
    And an audit event "menu_item.image_uploaded" with outcome "SUCCESS" is recorded
    And an "info" log entry has:
      | event   | menu_item.image_uploaded |
      | outcome | SUCCESS                  |

    Examples:
      | kind | file           |
      | JPEG | afang.jpg      |
      | PNG  | afang.png      |
      | WebP | afang.webp     |

  Scenario: Replacing a photo removes the old files
    Given "Afang Soup" has a photo
    And I am signed in as the super admin "owner@example.com"
    When I upload a JPEG file named "new-afang.jpg" as the photo of "{{item:Afang Soup}}"
    Then the response status is 201
    And the response JSON at "oldFilesRemoved" is JSON:
      """
      true
      """
    And photo storage no longer holds the earlier photo
    And photo storage holds 2 files
    And the menu shows the uploaded photo for "Afang Soup"

  Scenario: Removing a photo brings back "Photo coming"
    Given "Afang Soup" has a photo
    And I am signed in as the super admin "owner@example.com"
    When I DELETE the admin path "/menu-items/{{item:Afang Soup}}/image"
    Then the response status is 204
    And photo storage holds 0 files
    And the menu shows no photo for "Afang Soup"
    And an audit event "menu_item.image_removed" with outcome "SUCCESS" is recorded

  Scenario: A super admin sees how much photo storage is used
    Given photo storage reports 805306368 bytes used
    And I am signed in as the super admin "owner@example.com"
    When I GET the admin path "/storage-usage"
    Then the response status is 200
    And the response JSON at "percent" is JSON:
      """
      75
      """
    And the response JSON at "nearLimit" is JSON:
      """
      true
      """

  Scenario: An upload past 70% of the allowance warns in the log
    Given photo storage reports 805306368 bytes used
    And I am signed in as the super admin "owner@example.com"
    When I upload a JPEG file named "afang.jpg" as the photo of "{{item:Afang Soup}}"
    Then the response status is 201
    And the response JSON at "storage.nearLimit" is JSON:
      """
      true
      """
    And a "warn" log entry has:
      | event | storage.near_limit |

  # ---------- sad paths ----------

  Scenario Outline: Refused files (<case>)
    Given I am signed in as the super admin "owner@example.com"
    When I upload a <kind> file named "<file>" as the photo of "{{item:Afang Soup}}"
    Then the response status is <status>
    And the response JSON at "error.code" is "<code>"
    And photo storage holds 0 files
    And the menu shows no photo for "Afang Soup"
    And a "warn" log entry has:
      | event   | menu_item.image_uploaded |
      | outcome | FAILED                   |

    Examples:
      | case                      | kind         | file        | status | code                   |
      | a GIF                     | GIF          | afang.gif   | 415    | UNSUPPORTED_IMAGE_TYPE |
      | text named like a JPEG    | text         | afang.jpg   | 415    | UNSUPPORTED_IMAGE_TYPE |
      | a JPEG named like a PNG   | JPEG         | afang.png   | 415    | IMAGE_TYPE_MISMATCH    |
      | an empty file             | empty        | afang.jpg   | 400    | IMAGE_REQUIRED         |
      | a damaged picture         | damaged JPEG | afang.jpg   | 422    | IMAGE_UNREADABLE       |

  Scenario: A form without a file is refused
    Given I am signed in as the super admin "owner@example.com"
    When I send a photo form without a file for "{{item:Afang Soup}}"
    Then the response status is 400
    And the response JSON at "error.code" is "IMAGE_REQUIRED"

  Scenario: A file over the size limit is refused
    Given the API is running with:
      | MAX_IMAGE_UPLOAD_MB | 1 |
    And I am signed in as the super admin "owner@example.com"
    When I upload a 2 MB file named "huge.jpg" as the photo of "{{item:Afang Soup}}"
    Then the response status is 413
    And the response JSON at "error.code" is "PAYLOAD_TOO_LARGE"
    And photo storage holds 0 files

  Scenario: An unknown dish
    Given I am signed in as the super admin "owner@example.com"
    When I upload a JPEG file named "afang.jpg" as the photo of "00000000-0000-4000-8000-000000000000"
    Then the response status is 404
    And the response JSON at "error.code" is "MENU_ITEM_NOT_FOUND"
    And photo storage holds 0 files

  Scenario: A malformed dish id
    Given I am signed in as the super admin "owner@example.com"
    When I upload a JPEG file named "afang.jpg" as the photo of "not-a-uuid"
    Then the response status is 400

  Scenario: Removing a photo that is not there
    Given I am signed in as the super admin "owner@example.com"
    When I DELETE the admin path "/menu-items/{{item:Afang Soup}}/image"
    Then the response status is 404
    And the response JSON at "error.code" is "IMAGE_NOT_FOUND"

  Scenario Outline: Who may manage photos (<who>)
    Given <session>
    When I upload a JPEG file named "afang.jpg" as the photo of "{{item:Afang Soup}}"
    Then the response status is <status>
    And photo storage holds 0 files
    When I GET the admin path "/storage-usage"
    Then the response status is <status>

    Examples:
      | who          | session                                               | status |
      | signed out   | I am not signed in                                    | 401    |
      | a customer   | I am signed in as "ekaette@example.com"               | 403    |
      | a supervisor | I am signed in as the supervisor "chef@example.com"   | 403    |

  Scenario: A storage failure keeps the earlier photo and leaves nothing behind
    Given "Afang Soup" has a photo
    And photo storage fails after storing the thumbnail
    And I am signed in as the super admin "owner@example.com"
    When I upload a JPEG file named "afang.jpg" as the photo of "{{item:Afang Soup}}"
    Then the response status is 503
    And the response JSON at "error.code" is "SERVICE_UNAVAILABLE"
    And photo storage holds 2 files
    And the menu still shows the earlier photo for "Afang Soup"
    And an "error" log entry has:
      | event   | menu_item.image_uploaded |
      | outcome | FAILED                   |

  Scenario: The database being down gives a safe 503 and stores nothing
    Given I am signed in as the super admin "owner@example.com"
    And the database is unreachable
    When I upload a JPEG file named "afang.jpg" as the photo of "00000000-0000-4000-8000-000000000000"
    Then the response status is 503
    And photo storage holds 0 files
    And the response body does not contain "127.0.0.1"

  Scenario: Uploads are rate limited
    Given the API is running with:
      | THROTTLE_STRICT_LIMIT | 1 |
    And I am signed in as the super admin "owner@example.com"
    When I upload a JPEG file named "afang.jpg" as the photo of "{{item:Afang Soup}}"
    Then the response status is 201
    When I upload a JPEG file named "afang.jpg" as the photo of "{{item:Afang Soup}}"
    Then the response status is 429
    And the response header "retry-after" is a positive integer
