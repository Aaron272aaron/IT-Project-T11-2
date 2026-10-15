def best_word(board, values):
    paths = []
    for r, row in enumerate(board):
        for c, char in enumerate(row):
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                r1, c1 = r + dr, c + dc
                if not (0 <= r1 < len(board) and 0 <= c1 < len(row)):
                    continue
                for er, ec in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    r2, c2 = r1 + er, c1 + ec
                    if 0 <= r2 < len(board) and 0 <= c2 < len(row):
                        word = char + board[r1][c1] + board[r2][c2]
                        paths.append((sum(values[x] for x in word), word))
    return max(paths)[1]

