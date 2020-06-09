# MidlandArchiveSearch
A Client-Side Full-Text Search Engine for my High School's Newspaper and Yearbook Archive

## Features
- A complete web application* 
- Easy to host 
- Optimized initialization speed
- Visualization of occurrences of the query
- Context for each occurrence
- Allows user to decide what are stopwords
- Supports IE 11
- Uses [Vanilla JS](http://vanilla-js.com/)
- Uses [Lancaster Stemmer](https://github.com/words/lancaster-stemmer)

\* when used with a file server and we can argue about the definition
## Demo
[The Actual Archive](https://midland-school.org/midland-mirror-archive/) 

[Gulliver's Travels](https://raw.githack.com/zbw8388/MidlandArchiveSearch/master/demo/index.html) (Note: generated links will not work. Please just treat them as chapter titles where they should be path to files in the real setting. Year From/To function will also not work.)

![Demo Gif](/demo/demo.gif?raw=true "Demo Gif")

## Use it for Your Archive
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

For each indexed file, it is recorded with this structure inside `text.txt`:

`\x1c<file path>\x1d<file content>`

where `\x1c, \x1d` are File Separator and Group Separator in unicode, respectively.

Then, one can concatenate all file records together, so the final result will be:

`\x1c<file path>\x1d<file content>\x1c<another file path>\x1d<another file content>...`


### Install the searcher

In your folder with all PDF files, create a new folder, called `searcher`, and move all files in `src/` into that folder. If you have a file server, you can visit the seacher at `/searcher/index.html`. 

### Customize

Since this is an end product, I choose not to provide any API for changing the default behavior. Please let me know if I should!

- At `src/display.js` line 39, change the file size to that of your `text.txt` and estimated yearly increase to ensure that loading progress is displayed correctly. (Note: the server I was working with uses chunked transfer encoding, which does not show the actual file size in the request header. As a result, I have to estimate that number)
- At `src/display.js` line 409, you can change the relative path to the root folder. 
- The Year From/To input tag is using the first four characters of the file path. You can modify that behavior at `src/display.js` line 272.
- Change `src/mirror.png` to the logo you want. Change the `<img>` tag in `src/index.html` if you want.
- At `src/searcher.js` line 600, you can change the stemmer/add an encoder.

## Special Syntax
TODO: finish writing

## Motivation
- Some might ask why I'm creating client-side solution instead of using a server-side database, like [Elasticsearch](https://en.wikipedia.org/wiki/Elasticsearch). The truth is, I don't have control over the hosting server... It's also a hassle to maintain a server, whereas I don't expect ES5 to become obsolete any time soon.

- While there are a couple client-side full-text search engines available, such as [flexsearch](https://github.com/nextapps-de/flexsearch), [wade](https://github.com/kbrsh/wade), I choose not to use them for the following reasons: 
    - They don't have the functionality that I want. Since one yearbook might contain multiple articles, it would be ineffective for me to show the occurrence of a phrase/word without letting my users know how they are distributed within that yearbook. Thus, I would like to have a word-level inverted index, but I cannot find those on Github. Granted, I can easily modify existing searchers to achieve this goal without adding a significant amount of resource consumption, as the maximum index is only at ~10M, which is way less than 2^30, the maximum internal integer representation for V8 engine.

    - They have a rather slow initialization speed. They (flexsearch) apply stemmer (or encoder) on the *entire* text, which removed the possibility of reusing results from the stemmer (well, it is true that string operations are faster on a long string than a lot of shorter ones). Stemmers are especially costly, as they make a lot of non-slicing operations on strings, which requires allocating new memory. My code avoids that issue by creating a cache dictionary for the stemmer, and applying stemmer on each word, so that results can get reused. By doing this, the amount of words that need to go through the stemmer is reduced to ~3% of the original count, which leads to a ~65% reduction in initialization time when compared to the former approach. It also allows the usage of more complex stemmers instead of regex only. I would assume that creating extra rules for stemmer or encoder (e.g. phonetic changes) won't greatly increase the initialization time. Also, my code avoids any preprocessing of the text--words that comes out of the tokenizer (which only performs a slicing operation so no extra memory allocation is needed) go directly to the cache dictionary. I found that if there is one string preprocessing (e.g. `.toLowerCase()`), the time for initialization will go up by ~30%.

    - They are not built for my use case. I don't need to index a dictionary, nor do I need blazing fast search speed. All I need is a superb initialization speed, and a reasonable search speed so users can start searching as soon as possible. (For now most of the search time is used for rendering the context SVG. Maybe I should use canvas instead...)

- Though I did not use it directly, the core part of this project (`src/searcher.js`) is greatly inspired by [flexsearch](https://github.com/nextapps-de/flexsearch).