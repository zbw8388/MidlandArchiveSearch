var searcher = new Searcher();

var display = new Display();

var context = new Context();

function doSearch() {
    if (display.state === 'aboutPage') {
        display.prepareSearchPage();
    }
    var query = display.searchBar.value;
    searcher.search(query);
    if (query && searcher.workers) {
        display.clearTable();
        display.clearSearchTerms();
        display.renderPlaceHolder('Searching...');
    }
}

getResource('text.txt', display.onDownloadProgress.bind(display), function(text) {
    // i've tried to release memory for text, but i just realized that the caller holds a copy of it,
    // so i just gave up 

    var timeLoaded = new Date();

    if (searcher.workers) {
        searcher.feedText(text);
        display.fileLoaded.call(display, timeLoaded);
    } else {
        display.fileLoaded.call(display, timeLoaded);
        searcher.feedText(text);
    }
});
