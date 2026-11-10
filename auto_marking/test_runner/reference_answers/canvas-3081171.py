secure_pw = ''.join('*' if c.lower() in 'aeiou' else c for c in password)
