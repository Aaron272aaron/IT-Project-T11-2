from collections import Counter
def most_common_letter(board):
    counts = Counter(c for row in board for c in row)
    return min(counts, key=lambda c: (-counts[c], c))

