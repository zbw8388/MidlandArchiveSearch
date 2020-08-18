/**
 * Shorthand for document.getElementById
 * @param {string} id element id
 * @returns {HTMLElement}
 */
function gel(id) {
    return document.getElementById(id);
}

/**
 * Create a new elemnt
 * @param {string} type the type of the new element
 * @param {HTMLElement=} parent new element's parent
 * @param {string=} classes classes of the new element as a string
 * @returns {HTMLElement} the new element
 */
function el(type, parent, classes) {
    var e = document.createElement(type);
    return handleParentClasses(e, parent, classes);
}

/**
 * Create a new SVG elemnt
 * @param {string} type the type of the new element
 * @param {SVGElement=} parent new element's parent
 * @param {string=} classes classes of the new element as a string
 * @returns {SVGElement} the new SVG element
 */
function els(type, parent, classes) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", type);
    return handleParentClasses(e, parent, classes);
}

function handleParentClasses(e, parent, classes) {
    // pretty nonstandard, but hey, it works on ie 11 for svg stuff!
    classes && attr(e, 'class', classes);
    parent && parent.appendChild(e);
    return e;
}

/**
 * Shorthand for Element.setAttribute
 * @param {HTMLElement} e 
 * @param {string} prop 
 * @param {string} val 
 */
function attr(e, prop, val) {
    e.setAttribute(prop, val);
}

/**
 * Performs a GET request
 * @param {string} path 
 * @param {Function=} onprogress progress listener
 * @param {Function=} onloadend the callback that handles the response
 */
function getResource(path, onprogress, onloadend) {
    var client = new XMLHttpRequest();
    client.open('GET', path);
    client.onprogress = onprogress;
    client.onreadystatechange = function(e) {
        if (this.readyState === 4) {
            onloadend && onloadend(client.responseText);
        }
    }
    client.send();
}

/**
 * Checks if the finger is still inside the event handler attatched element
 * at a touchend event 
 * @param {TouchEvent} event the touch event to check for
 * @returns {boolean}
 */
function touchEndEventInBound(event) {
    if (event.type !== 'touchend')
        return true;
    var touchX = event.changedTouches[0].clientX;
    var touchY = event.changedTouches[0].clientY;
    var boundingBox = event.currentTarget.getBoundingClientRect();
    var eleX = boundingBox.left;
    var eleY = boundingBox.top;
    var eleH = boundingBox.height;
    var eleW = boundingBox.width;
    return eleX <= touchX && touchX <= eleX + eleW && eleY <= touchY && touchY <= eleY + eleH;
}

/**
 * Listens for both mousedown and touchend event, but only call the callback once
 * if both events fired at the same time (which happens on my laptop)
 * @constructor
 * @param {HTMLElement} e the element 
 * @param {Function} func the callback
 * @param {*} thisEle `this` variable for the callback
 */
function TouchMouseEventListener(e, func, thisEle) {
    this.func = func;
    this.thisEle = thisEle;

    this.prevTimeStamp = null;
    this.prevEventType = null;

    e.addEventListener('mousedown', this.fire.bind(this));
    e.addEventListener('touchend', this.fire.bind(this), {
        passive: true
    });
}
TouchMouseEventListener.prototype.fire = function(event) {
    var timeStamp = event.timeStamp;

    if (this.prevEventType === event.type || timeStamp - this.prevTimeStamp > 100) {
        this.prevEventType = event.type;
        this.prevTimeStamp = timeStamp;

        this.func.call(this.thisEle, event);
    }
}
