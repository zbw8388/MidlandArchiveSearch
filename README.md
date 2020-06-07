# MidlandArchiveSearch
A Client-Side Full-Text Search Engine for my High School's Newspaper and Yearbook Archive

## Features
- A complete web application* 
- Easy to host 
- Optimized initialization speed
- Visualization of occurrences of the query
- Context for each occurrence
- Supports IE 11
- Uses [Vanilla JS](http://vanilla-js.com/)
- Uses [Porter Stemmer](https://github.com/words/stemmer)

\* when used with a file server and we can argue about the definition
## Demo
[The Actual Archive](https://midland-school.org/midland-mirror-archive/) 

[Gulliver's Travels](https://raw.githack.com/zbw8388/MidlandArchiveSearch/master/demo/search.html) (Note: generated links will not work. Please just treat them as chapter titles where they should be path to files in the real setting. Year From/To function will also not work.)
## Use it For Your Archive
### Generate `text.txt` file 
#### Generate `text.txt` file from PDFs

0. Make sure you have Python 3 installed.
1. Put all your documents in PDF format into one folder (either scanned or digital).
2. If your files contain scanned documents and you have not run OCR on them (or you are not satisfied with the OCR result), install
    - [pyMuPDF](https://github.com/pymupdf/PyMuPDF)
    - [pytesseract](https://github.com/madmaze/pytesseract) (remember to install [Google Tesseract OCR](https://github.com/tesseract-ocr/tesseract) as well)
   
     Then, change the tesseract path in `tools/performOCR.py`, and run the script in your folder with all PDFs. It should generate .txt files with OCR result next to scanned files. This step might take a long time. You may close the script at any time as it saves the content of a file as soon as it's scanned.
    
    Note: this script can only detect if the entire file is scanned or not, and it does not automatically fix the rotation. It also does not use parallelization to speed up the process. If you have mixed content or some horizontal pages or need to speed up the process, consider using [OCRmyPDF](https://github.com/jbarlow83/OCRmyPDF) or [Adobe Acrobat](https://acrobat.adobe.com/us/en/acrobat.html) (I used it to fix the rotation and I manually inspected skipped files). 

3. If you have digital files or the previous step has skipped any file, install

    - [tika-python](https://github.com/chrismattmann/tika-python)

    Then, run `tools/performTextExtraction.py` in the folder with all PDFs. It will warn you if the file is empty, which might mean that it's a scanned file. In that case, try doing step 2.

4. Run `tools/createDataFile.py` in the folder with all PDFs. It should generate `text.txt` file. You can now put it into the `src/` folder. 

#### OR, generate `text.txt` file by yourself

The file has the following structure:

For each file, it is recorded as the following:

`\x1c<file path>\x1d<file content>`

where `\x1c, \x1d` are File Separator and Group Separator in unicode, respectively.

Then, one can concatenate all file records together, so the final result will be:

`\x1c<file path>\x1d<file content>\x1c<another file path>\x1d<another file content>...`


### Install the searcher

In your folder with all PDF files, create a new folder, called `searcher`, and move all files in `src/` into that folder. If you have a file server, you can visit the seacher at `/searcher/search.html`. 

### Customize

- In `src/search.js` line 409, you can change the relative path to all your PDFs. 
- The Year From/To input tag is using the first four characters of the file path. You can modify that behaviour at `src/search.js` line 272.
- Change `src/mirror.png` to the logo you want. Change the `<img>` tag in `src/search.html` if you want.
- If you would like to use a different stemmer, change `src/searcher.js` line 640

## Special Syntax
TODO: finish writing