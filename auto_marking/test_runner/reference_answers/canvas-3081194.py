def similarity(board, char):
    return sum(row.count(char) for row in board)

