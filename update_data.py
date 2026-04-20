import re
import random

with open('jewelry-data.js', 'r', encoding='utf-8') as f:
    content = f.read()

def repl(match):
    weight = round(random.uniform(5.0, 60.0), 1)
    touches = [92.9, 91.6, 85.5, 82.0]
    touch = random.choice(touches)
    return f"{match.group(0)}\n    weight: {weight},\n    touch: {touch},"

# Let's match the tags line to append after it
new_content = re.sub(r"tags:\s*\[.*?\],", repl, content)

with open('jewelry-data.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Added weight and touch!")
