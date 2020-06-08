import os
import re, json

def collapseLines(text):
    text = re.sub(r'-\s+', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text

listOfFiles = []
for (dirpath, dirnames, filenames) in os.walk('./'):
    listOfFiles += [os.path.join(dirpath, file)[2:] for file in filenames if file[-4:] == '.pdf']


textFile = open('text.txt', 'w', encoding="utf-8")

processedFiles = []

current = 0

print('Creating database...')

for path in listOfFiles:
    current += 1
    print('%d/%d files done' % (current, len(listOfFiles)))

    txtFile = path[:-4] + '.txt'

    if not os.path.exists(txtFile):
        textFile.close()
        os.remove('text.txt')
        print('Error: cannot find file: %s' % txtFile)
        input('Press Enter to Exit...')
        quit()

    with open(txtFile, encoding='utf-8') as f:
        text = f.read()
    text = collapseLines(text)

    text = '\x1c' + txtFile + '\x1d' + text
    
    textFile.write(text)

    processedFiles.append(txtFile)

textFile.close()

print('\n--------------\n\nFinished\n')

ans = input('Would you like to remove all intermediate files? (y/n) ')

if ans == 'y':
    processedFiles = processedFiles + ['createDataFile.py', 'performOCR.py', 'performTextExtraction.py']
    for i in processedFiles:
        if os.path.exists(i):
            os.remove(i)