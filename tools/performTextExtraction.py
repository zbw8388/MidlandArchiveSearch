from tika import parser
import os

listOfFiles = []
for (dirpath, dirnames, filenames) in os.walk('./'):
    listOfFiles += [os.path.join(dirpath, file)[2:] for file in filenames if file[-4:] == '.pdf']

def getText(path):
    return parser.from_file(path)['content']

print('Extracting text from %d files...' % len(listOfFiles))


current = 0

emptyFiles = []
    
for i in listOfFiles:
    print('%d/%d files done - processing %s' % (current, len(listOfFiles), i))
    current += 1

    if (os.path.exists('%s.txt' % i[:-4])):
        continue

    text = getText(i)

    if not text or not text.strip():
        emptyFiles.append(i)
        text = ''

    with open('%s.txt' % i[:-4], 'w', encoding='utf-8') as f:
        f.write(text)

print('\n--------------\n')

if emptyFiles:
    print('Warning: following files are empty. Please double check to see if they are scanned files:\n')
    for i in emptyFiles:
        print(i)
else:
    print('Finished')

input('\nPress Enter to Exit...')
quit()