import re

with open('gulliver.txt', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'\{.*?\}', '', text)

text = re.sub(r'(P_\d+\|CH_\d+)', '\x1c\\1\x1d', text)

text = '\x1cLETTER_TO_SYMPSON\x1d' + text

with open('text.txt', 'w', encoding='utf-8') as f:
    f.write(text)