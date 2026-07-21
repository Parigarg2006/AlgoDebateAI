#include <vector>
#include <queue>
#include <algorithm>

using namespace std;

class Solution {
public:
    int trapRainWater(vector<vector<int>>& heightMap) {
        if (heightMap.empty() || heightMap[0].empty()) return 0;
        int m = heightMap.size();
        int n = heightMap[0].size();
        if (m < 3 || n < 3) return 0;

        typedef pair<int, pair<int, int>> Cell;
        priority_queue<Cell, vector<Cell>, greater<Cell>> pq;
        vector<vector<bool>> visited(m, vector<bool>(n, false));

        for (int i = 0; i < m; ++i) {
            pq.push({heightMap[i][0], {i, 0}});
            pq.push({heightMap[i][n - 1], {i, n - 1}});
            visited[i][0] = true;
            visited[i][n - 1] = true;
        }
        for (int j = 1; j < n - 1; ++j) {
            pq.push({heightMap[0][j], {0, j}});
            pq.push({heightMap[m - 1][j], {m - 1, j}});
            visited[0][j] = true;
            visited[m - 1][j] = true;
        }

        int totalWater = 0;
        int dr[] = {0, 0, 1, -1};
        int dc[] = {1, -1, 0, 0};

        while (!pq.empty()) {
            Cell top = pq.top();
            pq.pop();
            int h = top.first;
            int r = top.second.first;
            int c = top.second.second;

            for (int i = 0; i < 4; ++i) {
                int nr = r + dr[i];
                int nc = c + dc[i];
                if (nr >= 0 && nr < m && nc >= 0 && nc < n && !visited[nr][nc]) {
                    totalWater += max(0, h - heightMap[nr][nc]);
                    pq.push({max(h, heightMap[nr][nc]), {nr, nc}});
                    visited[nr][nc] = true;
                }
            }
        }
        return totalWater;
    }
};

/* LeetCode Strict Signature Verification */
namespace leetcode_signature_verify {
    typedef int (Solution::*SignatureType)(vector<vector<int>>&);
    SignatureType check_ptr = &Solution::trapRainWater;
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

    int rows_arg_0, cols_arg_0;
    if (!(std::cin >> rows_arg_0 >> cols_arg_0)) return 0;
    vector<vector<int>> arg_0(rows_arg_0, std::vector<int>(cols_arg_0));
    for (int r = 0; r < rows_arg_0; ++r) {
        for (int c = 0; c < cols_arg_0; ++c) {
            if (!(std::cin >> arg_0[r][c])) return 0;
        }
    }
    
    Solution sol;
    std::cout << sol.trapRainWater(arg_0) << std::endl;
    return 0;
}
