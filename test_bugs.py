"""
DebugDuck Test File - Python Bug Examples

This file contains intentional bugs to test DebugDuck's detection capabilities.
Bugs are categorized into:
1. DETECTABLE - Bugs DebugDuck can find and help with
2. GAPS - Bugs that highlight areas for improvement

To test: Select a buggy code section and press Cmd+Shift+D (or Ctrl+Shift+D)
"""

# =============================================================================
# SECTION 1: DETECTABLE BUGS - DebugDuck should catch these
# =============================================================================

# -----------------------------------------------------------------------------
# 1.1 Undefined Access (undefined-access)
# DebugDuck Detection: HIGH - This is a core detection pattern
# -----------------------------------------------------------------------------

def get_user_name(users, user_id):
    """Bug: No check if user_id exists in the list"""
    # BUG: Will crash if user_id >= len(users)
    return users[user_id].name


def get_config_value(config, key):
    """Bug: No check if key exists"""
    # BUG: Will raise KeyError if key doesn't exist
    return config[key]["value"]


# -----------------------------------------------------------------------------
# 1.2 Null/None Reference (null-reference)
# DebugDuck Detection: HIGH - Core detection pattern
# -----------------------------------------------------------------------------

def process_response(response):
    """Bug: No null check before accessing properties"""
    # BUG: response might be None
    data = response.json()
    return data["results"]


def get_nested_value(obj):
    """Bug: Chained access without null checks"""
    # BUG: Any level could be None
    return obj.user.profile.settings.theme


# -----------------------------------------------------------------------------
# 1.3 Async/Await Issues (async-await)
# DebugDuck Detection: MEDIUM - Detected via pattern matching
# -----------------------------------------------------------------------------

async def fetch_data(url):
    """Bug: Missing await on async call"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        # BUG: Missing await - returns coroutine, not response
        response = session.get(url)
        return response.json()  # This will fail


def call_async_wrong():
    """Bug: Calling async function without await"""
    # BUG: This returns a coroutine object, not the actual data
    result = fetch_data("https://api.example.com")
    print(result)  # Prints: <coroutine object fetch_data at 0x...>


# -----------------------------------------------------------------------------
# 1.4 Off-by-One Errors (off-by-one)
# DebugDuck Detection: MEDIUM - Pattern-based detection
# -----------------------------------------------------------------------------

def sum_array(arr):
    """Bug: Off-by-one in loop range"""
    total = 0
    # BUG: Should be range(len(arr)), this misses last element
    for i in range(len(arr) - 1):
        total += arr[i]
    return total


def copy_array(source):
    """Bug: Off-by-one causes index out of bounds"""
    dest = [0] * len(source)
    # BUG: range goes to len(source) inclusive, should be len(source) - 1
    for i in range(0, len(source) + 1):
        dest[i] = source[i]
    return dest


# -----------------------------------------------------------------------------
# 1.5 Comparison Errors (comparison)
# DebugDuck Detection: MEDIUM - Detects == vs is issues
# -----------------------------------------------------------------------------

def check_none(value):
    """Bug: Using == instead of 'is' for None comparison"""
    # BUG: Should use 'is None' not '== None'
    if value == None:
        return "No value"
    return value


def compare_floats(a, b):
    """Bug: Direct float comparison"""
    # BUG: Floating point comparison is unreliable
    if a == b:
        return True
    return False


# -----------------------------------------------------------------------------
# 1.6 Type Mismatch (type-mismatch)
# DebugDuck Detection: MEDIUM - Can detect obvious mismatches
# -----------------------------------------------------------------------------

def concatenate_values(name, count):
    """Bug: Concatenating string with int"""
    # BUG: Cannot concatenate str and int directly
    return "User " + name + " has " + count + " items"


def add_to_list(items, new_item):
    """Bug: Using += with wrong type"""
    # BUG: This extends the list with characters, not appends string
    items += new_item  # If new_item is "abc", adds ['a', 'b', 'c']
    return items


# =============================================================================
# SECTION 2: GAPS - Bugs DebugDuck might miss (improvement opportunities)
# =============================================================================

# -----------------------------------------------------------------------------
# 2.1 Logic Errors - Require understanding intent
# Gap: DebugDuck doesn't know what the code SHOULD do
# -----------------------------------------------------------------------------

def calculate_average(numbers):
    """Bug: Logic error - wrong formula"""
    # BUG: Divides by wrong value (should be len(numbers))
    total = sum(numbers)
    return total / 10  # Hard-coded divisor instead of len(numbers)


def is_leap_year(year):
    """Bug: Incomplete leap year logic"""
    # BUG: Missing the century exception rule
    # Correct: divisible by 4, except centuries unless divisible by 400
    return year % 4 == 0  # Missing: and (year % 100 != 0 or year % 400 == 0)


def find_max(numbers):
    """Bug: Wrong initial value"""
    # BUG: If all numbers are negative, this returns 0 incorrectly
    max_val = 0  # Should be float('-inf') or numbers[0]
    for n in numbers:
        if n > max_val:
            max_val = n
    return max_val


# -----------------------------------------------------------------------------
# 2.2 Race Conditions - Require concurrency analysis
# Gap: Static analysis can't easily detect timing issues
# -----------------------------------------------------------------------------

counter = 0

def increment():
    """Bug: Race condition in multi-threaded context"""
    global counter
    # BUG: Not thread-safe - read-modify-write is not atomic
    counter = counter + 1


shared_list = []

def add_item(item):
    """Bug: Concurrent list modification"""
    # BUG: List operations aren't thread-safe
    if item not in shared_list:
        # Another thread could add item between check and append
        shared_list.append(item)


# -----------------------------------------------------------------------------
# 2.3 Resource Leaks - Require tracking resource lifecycle
# Gap: Need to track open/close pairs across code paths
# -----------------------------------------------------------------------------

def read_file_unsafe(filename):
    """Bug: File handle never closed"""
    # BUG: File is never closed if exception occurs (or at all)
    f = open(filename, 'r')
    content = f.read()
    return content
    # f.close() is never called


def connect_to_database(config):
    """Bug: Connection leak on error"""
    import sqlite3
    conn = sqlite3.connect(config['db'])
    cursor = conn.cursor()
    # BUG: If query fails, connection is leaked
    cursor.execute("SELECT * FROM users")
    return cursor.fetchall()
    # conn.close() never called


# -----------------------------------------------------------------------------
# 2.4 Security Vulnerabilities - Require security-specific analysis
# Gap: DebugDuck focuses on bugs, not security issues
# -----------------------------------------------------------------------------

def execute_query(user_input):
    """Bug: SQL Injection vulnerability"""
    import sqlite3
    conn = sqlite3.connect('app.db')
    # BUG: Direct string interpolation allows SQL injection
    query = f"SELECT * FROM users WHERE name = '{user_input}'"
    return conn.execute(query).fetchall()


def render_html(user_content):
    """Bug: XSS vulnerability"""
    # BUG: User content not escaped, allows script injection
    return f"<div>{user_content}</div>"


def load_pickle(data):
    """Bug: Unsafe deserialization"""
    import pickle
    # BUG: Pickle can execute arbitrary code
    return pickle.loads(data)


# -----------------------------------------------------------------------------
# 2.5 Performance Issues - Require complexity analysis
# Gap: Performance isn't in DebugDuck's current scope
# -----------------------------------------------------------------------------

def find_duplicates_slow(items):
    """Bug: O(n²) when O(n) is possible"""
    duplicates = []
    # BUG: Nested loop is O(n²), could use set for O(n)
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates


def sum_nested_lists(lists):
    """Bug: Repeated string concatenation is O(n²)"""
    result = ""
    # BUG: String concatenation in loop is slow
    for lst in lists:
        for item in lst:
            result += str(item) + ","  # Creates new string each time
    return result


# -----------------------------------------------------------------------------
# 2.6 Semantic Errors - Require domain knowledge
# Gap: DebugDuck doesn't understand business logic
# -----------------------------------------------------------------------------

def calculate_discount(price, discount_percent):
    """Bug: Discount applied incorrectly"""
    # BUG: This ADDS to price instead of subtracting
    return price + (price * discount_percent / 100)


def convert_temperature(celsius):
    """Bug: Wrong conversion formula"""
    # BUG: Formula is wrong (should be C * 9/5 + 32)
    return celsius * 5/9 + 32


def validate_email(email):
    """Bug: Overly simplistic validation"""
    # BUG: This allows invalid emails like "a@b"
    return "@" in email


# -----------------------------------------------------------------------------
# 2.7 State Management Bugs - Require tracking state across calls
# Gap: Need inter-procedural analysis
# -----------------------------------------------------------------------------

class ShoppingCart:
    """Bug: Mutable default argument"""

    def __init__(self, items=[]):  # BUG: Mutable default argument
        # All instances share the same list!
        self.items = items

    def add(self, item):
        self.items.append(item)


class Counter:
    """Bug: Incorrect state reset"""

    def __init__(self):
        self.count = 0
        self.history = []

    def increment(self):
        self.count += 1
        self.history.append(self.count)

    def reset(self):
        # BUG: Forgets to reset history
        self.count = 0
        # self.history = []  # Missing!


# -----------------------------------------------------------------------------
# 2.8 Edge Cases - Require understanding data constraints
# Gap: DebugDuck doesn't know about edge cases without context
# -----------------------------------------------------------------------------

def divide(a, b):
    """Bug: No zero division check"""
    # BUG: Will raise ZeroDivisionError if b is 0
    return a / b


def get_first_char(s):
    """Bug: No empty string check"""
    # BUG: Will raise IndexError if s is empty
    return s[0]


def calculate_percentage(part, whole):
    """Bug: Doesn't handle edge cases"""
    # BUG: Fails if whole is 0, or if part > whole
    return (part / whole) * 100


# =============================================================================
# SECTION 3: SUMMARY
# =============================================================================

"""
DEBUGDUCK DETECTION SUMMARY:

STRONG DETECTION (Core patterns):
✅ undefined-access    - Array/dict access without bounds checking
✅ null-reference      - Accessing properties on potentially None values
✅ async-await         - Missing await, unhandled promises
✅ type-mismatch       - String + int concatenation, wrong types
✅ comparison          - == vs is, float comparison issues
✅ off-by-one          - Loop bounds errors

MODERATE DETECTION (Pattern-based):
⚠️ error-handling     - Missing try-catch (partially detected)
⚠️ scope-issue        - Variable shadowing (partially detected)

GAPS FOR IMPROVEMENT:
❌ Logic errors        - Requires understanding programmer intent
❌ Race conditions     - Requires concurrency analysis
❌ Resource leaks      - Requires tracking resource lifecycle
❌ Security vulns      - Requires security-specific patterns (OWASP)
❌ Performance issues  - Requires complexity analysis
❌ Semantic errors     - Requires domain/business knowledge
❌ State bugs          - Requires inter-procedural analysis
❌ Edge cases          - Requires data constraint understanding

POTENTIAL ENHANCEMENTS:
1. Add SQL injection detection (pattern: f-string + execute)
2. Add resource leak detection (open without context manager)
3. Add mutable default argument detection (def foo(x=[]))
4. Add division by zero pattern detection
5. Add empty collection access pattern detection
"""
