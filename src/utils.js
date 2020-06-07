function update(obj, newobj) {
    for (var i in newobj) {
        obj[i] = newobj[i]
    }
}

function gel(id) {
    return document.getElementById(id);
}

function el(type, parent, classes) {
    var e = document.createElement(type);
    return handleParentClasses(e, parent, classes);
}

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

function attr(e, prop, val) {
    e.setAttribute(prop, val);
}

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
