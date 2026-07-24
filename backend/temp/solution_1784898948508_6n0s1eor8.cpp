#include <vector>
#include <string>

using namespace std;

class Solution {
private:
    const vector<string> mapping = {
        "",     // 0
        "",     // 1
        "abc",  // 2
        "def",  // 3
        "ghi",  // 4
        "jkl",  // 5
        "mno",  // 6
        "pqrs", // 7
        "tuv",  // 8
        "wxyz"  // 9
    };

    void backtrack(const string& digits, int index, string& current, vector<string>& result) {
        if (index == digits.length()) {
            result.push_back(current);
            return;
        }

        char digit = digits[index];
        if (digit < '2' || digit > '9') return;
        string letters = mapping[digit - '0'];

        for (char letter : letters) {
            current.push_back(letter);
            backtrack(digits, index + 1, current, result);
            current.pop_back();
        }
    }

public:
    vector<string> letterCombinations(string digits) {
        vector<string> result;
        if (digits.empty()) {
            return result;
        }
        string current = "";
        backtrack(digits, 0, current, result);
        return result;
    }
};

/* LeetCode Strict Signature Verification */
namespace leetcode_signature_verify {
    typedef vector<string> (Solution::*SignatureType)(string);
    SignatureType check_ptr = &Solution::letterCombinations;
}


/* Sandbox Test Runner Driver */
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <queue>
#include <stack>
#include <map>
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <numeric>
#include <cmath>

int main() {

    string arg_0;
    if (!(std::cin >> arg_0)) return 0;
  
    Solution sol;
    auto result = sol.letterCombinations(arg_0);
        for (size_t i = 0; i < result.size(); ++i) {
            std::cout << result[i] << (i + 1 == result.size() ? "" : " ");
        }
        std::cout << "\n";
    return 0;
}
