import os
import fitz
import pytesseract
import io
from PIL import Image


# remember to change this!
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


listOfFiles = []
# get the path for all PDF files
for (dirpath, dirnames, filenames) in os.walk('./'):
    listOfFiles += [os.path.join(dirpath, file)[2:] for file in filenames if file[-4:] == '.pdf']

print('Performing OCR on %d files...' % len(listOfFiles))

def reOCRPDF(loc):
    
    doc = fitz.open(loc)

    imgList = []


    for i in range(len(doc)):

        allImages = doc.loadPage(i).getImageList(True)
        # determine if the pdf is a scanned file
        # a real scanned file will only contain one and 
        # only one image in each page (note that there are better ways
        # to do it such as checking the color of each character, but it 
        # seems like pyMuPDF does not support that function)
        if len(allImages) != 1: return False

        imgList.append(allImages[0][0])

        imgBbox = doc.loadPage(i).getImageBbox(allImages[0][7])
        pageBbox = doc.loadPage(i).rect

        # an extra test to determine if a pdf is scanned, 
        # as the only photo should occupy the entire page
        for j in range(4):
            if abs(pageBbox[j] - imgBbox[j]) > 10: return False

    extractedText = []

    page = 0

    for xref in imgList:
        print('%d/%d pages done' % (page, len(imgList)))
        page += 1
        pix = fitz.Pixmap(doc, xref)
        img = Image.open(io.BytesIO(pix.getImageData()))
        text = pytesseract.image_to_string(img, lang='eng')
        pix = None
        img = None
        extractedText.append(text)

    text = '\n\n'.join(extractedText)
    with open('%s.txt' % loc[:-4], 'w', encoding='utf-8') as f:
        f.write(text)
    return True

current = 0

skipped = []

for i in listOfFiles:
    print('%d/%d files done - processing %s' % (current, len(listOfFiles), i))
    current += 1

    if (os.path.exists('%s.txt' % i[:-4])):
        continue

    if not reOCRPDF(i):
        # if you have time, make sure to double check these files
        print('skipping %s - not a scanned file' % i)
        skipped.append(i)


print('\n--------------\n')


if skipped:
    print('Skipped following files as they are not scanned files:\n')

    for i in skipped:
        print(i)
else:
    print('Finished')

input('\nPress Enter to Exit...')
quit()