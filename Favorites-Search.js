// ==UserScript==
// @name         Rule34 Favorites Search
// @version      1.0
// @description  Adds a search bar to the Favorites page
// @author       Librake
// @namespace    https://discord.gg/jZzYFNeCTw
// @match        https://rule34.xxx/index.php?page=favorites&s=view&id=*
// @icon         https://goo.su/zX0ivG
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==


const UseCustomIcon = true; // Use custom red icon for the Favorites page: true/false



(function () {
    'use strict';
    const discordLink = "https://discord.gg/jZzYFNeCTw"

    let allImages = [];
    let loadedImages = [];
    let images;
    let results = [];
    let searchTag = "";
    let searchTags = [];
    let negativeTags = [];
    let hardSearch = false;
    let orMode = false;
    let inputTags = [];
    let fromBack = false;
    let needScan = false;
    let fullScan = false;
    let actualFavCount;
    let prevFavCount;
    let loadedTags = [];
    let appendLoadedSave = false;
    let prevId;
    let lastImageId;

    let userId = getIdFromUrl();
    let isMobile = isMobileVersion();

    loadSavedData();

    function isMobileVersion() {
        const cssLinks = document.querySelectorAll('link[rel="stylesheet"][type="text/css"][media="screen"]');

        for (let i = 0; i < cssLinks.length; i++) {
            const href = cssLinks[i].getAttribute('href');
            if (href && href.includes('mobile.css')) {
                return true;
            }
        }

        return false;
    }

    function loadSavedData() {
        const savedInputTags = localStorage.getItem('inputTags');
        loadedTags = savedInputTags ? JSON.parse(savedInputTags) : [];
        const savedHardSearch = localStorage.getItem('hardSearch');
        hardSearch = savedHardSearch ? JSON.parse(savedHardSearch) : false;
        const savedOrMode = localStorage.getItem('orMode');
        orMode = savedOrMode ? JSON.parse(savedOrMode) : false;

        const savedFromBack = localStorage.getItem('fromBack');
        fromBack = savedFromBack ? JSON.parse(savedFromBack) : false;
        localStorage.removeItem('fromBack');

        const savedPrevFavCount = localStorage.getItem('prevFavCount');
        prevFavCount = (savedPrevFavCount && savedPrevFavCount != 'undefined') ? JSON.parse(savedPrevFavCount) : 0;

        const savedPrevId = localStorage.getItem('prevId');
        prevId = (savedPrevId && savedPrevId != 'undefined') ? JSON.parse(savedPrevId) : 0;
    }

    function reset() {
        localStorage.clear();
        location.reload();
    }

    function updateIcon(newIconUrl) {
        const existingFavicons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
        existingFavicons.forEach(favicon => favicon.parentNode.removeChild(favicon));

        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = newIconUrl;

        document.head.appendChild(link);

        const shortcutIconLink = document.createElement('link');
        shortcutIconLink.rel = 'shortcut icon';
        shortcutIconLink.href = newIconUrl;

        document.head.appendChild(shortcutIconLink);
    }

    function loadAllImagesFromLocalStorage(callback) {
        const storedData = localStorage.getItem('allImages');
        if (!storedData) {
            callback([]);
            return;
        }

        const decompressedData = LZString.decompressFromUTF16(storedData);
        const loadedAllImages = decompressedData ? JSON.parse(decompressedData) : [];
        callback(loadedAllImages);
    }

    function saveAllImagesToLocalStorage() {
        const allImagesData = [];
        allImagesData.push(...allImages.map(img => ({
            src: img.getAttribute('src'),
            title: img.getAttribute('title'),
            link: `index.php?page=post&s=view&id=${img.src.split('?')[1]}`
        })));

        if (appendLoadedSave) {
            allImagesData.push(...loadedImages.map(img => ({
                src: img.src,
                title: img.title,
                link: img.link
            })));
        }

        const jsonStr = JSON.stringify(allImagesData);

        const compressedData = LZString.compressToUTF16(jsonStr);
        try {
            localStorage.setItem('allImages', compressedData);
        } catch (e) {
            console.error("Storage limit exceeded: ", e);
        }
    }

    function getIdFromUrl() {
        var url = window.location.href;
        var idIndex = url.indexOf("id=");
        if (idIndex !== -1) {
            var idStartIndex = idIndex + 3;
            var idEndIndex = url.indexOf("&", idStartIndex);
            if (idEndIndex === -1) {
                idEndIndex = url.length;
            }
            var id = url.substring(idStartIndex, idEndIndex);
            return id;
        }
        return null;
    }

    async function getFavoritesCount(userId) {
        const url = `https://rule34.xxx/index.php?page=account&s=profile&id=${userId}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const favoritesRow = Array.from(doc.querySelectorAll('tr')).find(row =>
                row.querySelector('td strong')?.textContent.trim() === 'Favorites'
            );

            if (!favoritesRow) {
                throw new Error('Favorites row not found');
            }

            const favoritesCount = favoritesRow.querySelector('td a')?.textContent.trim();
            return favoritesCount ? parseInt(favoritesCount, 10) : null;
        } catch (error) {
            console.error('Error fetching favorites count:', error);
            return null;
        }
    }


    const SearchInputModule = (() => {

        function createSearchInput() {
            const header = document.getElementById('header');
            const navbar = document.getElementById('navbar');

            const inputContainer = document.createElement('div');
            inputContainer.style.marginLeft = '20px';

            const helpContainer = createHelpTooltip(isMobile ? -20 : 0);

            const createToggleElement = isMobile ? createToggleButton : createCheckbox;
            const verbatimModeContainer = createToggleElement('verbatimModeCheckbox', 'Verbatim mode', hardSearch, (checked) => {
                hardSearch = checked;
                localStorage.setItem('hardSearch', JSON.stringify(checked));
            });

            const orModeContainer = createToggleElement('orMode', 'Or mode', orMode, (checked) => {
                orMode = checked;
                localStorage.setItem('orMode', JSON.stringify(checked));
            });

            const inputWrapper = createSearchInputField();

            const searchButton = createSearchButton(() => {
                searchTags.length = 0;
                negativeTags.length = 0;
                inputTags = inputWrapper.querySelector('input').value.trim().split(' ');
                inputTags.forEach(tag => {
                    if (tag.startsWith('-')) {
                        negativeTags.push(tag.substring(1));
                    } else if (tag.length > 0) {
                        searchTags.push(tag);
                    }
                });
                scan();
            });

            const progress = document.createElement('span');
            progress.id = 'progress';
            progress.style.marginLeft = '10px';

            if (isMobile) {
                const container1 = document.createElement('div');
                container1.style.display = 'flex';
                container1.style.position = 'relative';
                container1.style.width = 'calc(100% - 20px - 20px)';
                container1.style.maxWidth = '430px';
                container1.style.marginLeft = '20px';

                progress.style.position = 'absolute';
                progress.style.right = '20px';

                container1.appendChild(helpContainer);
                container1.appendChild(progress);
                inputContainer.appendChild(container1);

                const container2 = document.createElement('div');
                container2.appendChild(inputWrapper);
                container2.style.marginTop = '17px';

                inputContainer.appendChild(container2);

                const container3 = document.createElement('div');
                container3.style.display = 'flex';
                container3.style.justifyContent = 'space-between';
                container3.style.width = 'calc(100% - 20px)';
                container3.style.maxWidth = '450px';
                container3.style.alignItems = 'center';
                container3.style.marginTop = '10px';


                container3.appendChild(verbatimModeContainer);
                container3.appendChild(orModeContainer);
                container3.appendChild(searchButton);
                inputContainer.appendChild(container3);

                const spacer = document.createElement('div');
                spacer.style.height = '10px';
                inputContainer.appendChild(spacer);

            } else {
                inputContainer.style.marginTop = '10px';
                inputContainer.appendChild(helpContainer);
                inputContainer.appendChild(verbatimModeContainer);
                inputContainer.appendChild(orModeContainer);
                inputContainer.appendChild(inputWrapper);
                inputContainer.appendChild(searchButton);
                inputContainer.appendChild(progress);
            }

            header.insertBefore(inputContainer, navbar.nextSibling);

            inputWrapper.querySelector('input').addEventListener('keyup', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    searchButton.click();
                }
            });

            if (loadedTags.length > 0) {
                inputWrapper.querySelector('input').value = loadedTags.join(' ');
            }
        }

        function createHelpTooltip(offset = 0) {
            const helpContainer = document.createElement('div');
            helpContainer.style.display = 'inline-block';
            helpContainer.style.marginRight = '50px';
            helpContainer.style.position = 'relative';

            const helpText = document.createElement('span');
            helpText.textContent = 'Help & Info';
            helpText.style.fontWeight = 'bold';
            helpText.style.color = '#000000';
            helpText.style.textDecoration = 'underline';

            const tooltip = document.createElement('div');
            tooltip.style.position = 'absolute';
            tooltip.style.top = '100%';
            tooltip.style.left = '0';
            tooltip.style.paddingTop = '10px';
            tooltip.style.paddingRight = '30px';
            tooltip.style.paddingBottom = '15px';
            tooltip.style.paddingLeft = '20px';
            tooltip.style.borderRadius = '5px';
            tooltip.style.backgroundColor = '#333';
            tooltip.style.color = '#fff';
            tooltip.style.whiteSpace = 'normal';
            tooltip.style.visibility = 'hidden';
            tooltip.style.opacity = '0';
            tooltip.style.transition = 'opacity 0.2s';
            tooltip.style.width = '550px';
            tooltip.style.maxWidth = 'calc(100vw - 30px)';
            tooltip.style.height = 'auto';
            tooltip.style.maxHeight = '400px';
            tooltip.style.marginTop = '10px';
            tooltip.style.marginLeft = `${offset}px`;
            tooltip.style.zIndex = '9999';
            tooltip.style.overflowX = 'auto';


            const closeButton = document.createElement('button');
            closeButton.textContent = '×';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '10px';
            closeButton.style.right = '10px';
            closeButton.style.background = 'none';
            closeButton.style.border = 'none';
            closeButton.style.color = '#fff';
            closeButton.style.fontSize = '20px';
            closeButton.style.cursor = 'pointer';

            closeButton.onclick = () => {
                hideTooltip();
            };


            const content = [
                `Script's search uses keywords instead of tags, you can search by any part of the tag, such as '<span style="color: #EC91FF;">gahara</span>' instead of 'senjou<span style="color: #EC91FF;">gahara</span>_hitagi'.`,
                "Verbatim mode - switch to standard search by full tags instead of keywords.",
                "Or mode - should search result contain any or all of tags/keywords.",
                "Use '-' to exclude tags/keywords.",
                "A full scan takes a while, but it's only needed for the first search or after a reset.",
                "On the search results page, use the Back button on the screen or Esc instead of the Back button on your browser."
            ];

            const list = document.createElement('ul');
            list.style.paddingLeft = '10px';
            list.style.margin = '0';
            list.style.listStyleType = 'disc';

            content.forEach(text => {
                const listItem = document.createElement('li');
                listItem.innerHTML = text;
                listItem.style.padding = '3px';
                listItem.style.margin = '5px 0';
                list.appendChild(listItem);
            });

            tooltip.appendChild(list);

            const tooltipText = document.createElement('div');
            tooltipText.innerHTML = "If smth doesn't work properly try to";

            const discordText = document.createElement('div');
            discordText.innerHTML = `
            <p><p>If you still have some questions or suggestions, visit the project's
            <a href="${discordLink}" target="_blank" style="color: #7289DA; text-decoration: underline; font-size: 1.2em;">Discord</a>.</p>
            <p>You can also find some other useful scripts for Rule34 there.</p>`;

            function updateTooltipMaxHeight() {
                const rect = tooltip.getBoundingClientRect();
                const availableHeight = window.innerHeight - rect.top - 10;
                tooltip.style.maxHeight = `${availableHeight}px`;
            }
            updateTooltipMaxHeight();
            window.addEventListener('resize', updateTooltipMaxHeight);


            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset';
            resetButton.style.backgroundColor = '#e26c5e';
            resetButton.style.color = '#fff';
            resetButton.style.border = 'none';
            resetButton.style.padding = '5px 10px';
            resetButton.style.borderRadius = '5px';
            resetButton.style.cursor = 'pointer';
            resetButton.style.marginTop = '10px';
            resetButton.style.marginLeft = '10px';
            resetButton.style.zIndex = '10000';
            resetButton.onmouseover = () => {
                resetButton.style.backgroundColor = '#c45a4b';
            };
            resetButton.onmouseout = () => {
                resetButton.style.backgroundColor = '#e26c5e';
            };
            resetButton.onclick = reset;

            tooltipText.appendChild(resetButton);
            tooltipText.appendChild(discordText);
            tooltip.appendChild(closeButton);
            tooltip.appendChild(tooltipText);

            let hideTimeout;
            helpText.onmouseover = () => {
                helpText.style.color = '#CC0000';
                clearTimeout(hideTimeout);
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
            };
            helpText.onmouseout = (event) => {
                hideTimeout = setTimeout(() => {
                    if (!tooltip.contains(event.relatedTarget)) {
                        hideTooltip();
                    }
                }, 300);
            };
            tooltip.onmouseover = () => {
                clearTimeout(hideTimeout);
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
            };
            tooltip.onmouseout = (event) => {
                hideTimeout = setTimeout(() => {
                    if (!helpText.contains(event.relatedTarget)) {
                        hideTooltip();
                    }
                }, 300);
            };

            helpContainer.appendChild(helpText);
            helpContainer.appendChild(tooltip);

            return helpContainer;

            function hideTooltip() {
                tooltip.style.visibility = 'hidden';
                tooltip.style.opacity = '0';
                helpText.style.color = '#000000';
            }
        }


        function createCheckbox(id, labelText, isChecked, onChange) {
            const container = document.createElement('div');
            container.style.display = 'inline-block';
            container.style.marginRight = '50px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = id;
            checkbox.style.marginRight = '5px';
            checkbox.style.verticalAlign = 'middle';
            checkbox.checked = isChecked;
            checkbox.onchange = () => onChange(checkbox.checked);

            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = labelText;
            label.style.verticalAlign = 'middle';

            container.appendChild(checkbox);
            container.appendChild(label);

            return container;
        }

        function createToggleButton(id, labelText, isActive, onChange) {
            const container = document.createElement('div');
            container.style.display = 'inline-block';

            const toggleButton = document.createElement('button');
            toggleButton.textContent = labelText;
            toggleButton.style.backgroundColor = isActive ? '#2196F3' : '#e0e0e0';
            toggleButton.style.color = isActive ? '#fff' : '#555';
            toggleButton.style.border = 'none';
            toggleButton.style.padding = '5px 8px';
            toggleButton.style.borderRadius = '4px';
            toggleButton.style.cursor = 'pointer';

            toggleButton.onmouseover = () => {
                toggleButton.style.backgroundColor = isActive ? '#1976D2' : '#bdbdbd';
            };
            toggleButton.onmouseout = () => {
                toggleButton.style.backgroundColor = isActive ? '#2196F3' : '#e0e0e0';
            };

            toggleButton.onclick = () => {
                isActive = !isActive;
                toggleButton.style.backgroundColor = isActive ? '#2196F3' : '#e0e0e0';
                toggleButton.style.color = isActive ? '#fff' : '#555';
                onChange(isActive);
            };

            container.appendChild(toggleButton);

            return container;
        }



        function createSearchInputField() {
            const inputWrapper = document.createElement('div');
            inputWrapper.style.position = 'relative';
            inputWrapper.style.display = 'inline-block';
            inputWrapper.style.width = 'calc(100% - 20px)';
            inputWrapper.style.maxWidth = '450px';
            inputWrapper.style.boxSizing = 'border-box';
            inputWrapper.style.marginRight = '10px';


            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Enter tags or parts of tags...';
            input.id = 'searchTagInput';
            input.style.padding = '5px';
            input.style.border = '1px solid #ccc';
            input.style.borderRadius = '3px';
            input.style.width = '100%';
            input.style.boxSizing = 'border-box';


            const clearButton = document.createElement('button');
            clearButton.textContent = '×';
            clearButton.style.border = 'none';
            clearButton.style.background = 'none';
            clearButton.style.fontSize = '25px';
            clearButton.style.cursor = 'pointer';
            clearButton.style.position = 'absolute';
            clearButton.style.right = '7px';
            clearButton.style.top = '50%';
            clearButton.style.transform = 'translateY(-50%)';
            clearButton.style.color = '#ccc';
            clearButton.style.padding = '0';

            clearButton.onclick = () => {
                input.value = '';
                input.focus();
                localStorage.removeItem('inputTags');
            };

            inputWrapper.appendChild(input);
            inputWrapper.appendChild(clearButton);

            return inputWrapper;
        }


        function createSearchButton(onClick) {
            const button = document.createElement('button');
            button.textContent = 'Search';

            button.onclick = onClick;

            button.style.color = 'white';
            button.style.backgroundColor = '#e26c5e';

            if (isMobile) {
                button.style.border = 'none';
                button.style.padding = '10px 20px';
                button.style.borderRadius = '5px';
            } else {
                button.style.marginRight = '10px';
                button.style.padding = '5px 10px';
                button.style.border = '1px solid #ccc';
                button.style.borderRadius = '3px';
                button.style.cursor = 'pointer';
                button.onmouseover = () => {
                    button.style.backgroundColor = '#c45a4b';
                };
                button.onmouseout = () => {
                    button.style.backgroundColor = '#e26c5e';
                };
            }

            return button;
        }

        return {
            createSearchInput
        };
    })();


    function scan() {
        if (needScan) {

            if (fullScan) {
                searchAllPages();
            }
            else {
                searchNewPages();
            }
        }
        else {
            loadAllPages();
        }
    }

    async function fetchFavoritesPage(page) {

        const url = `https://rule34.xxx/index.php?page=favorites&s=view&id=${userId}&pid=${page * 50}`;
        try {
            const response = await fetch(url);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            return doc;
        } catch (error) {
            console.error(`Error fetching page ${page}:`, error);
            return null;
        }
    }

    async function extractImagesAndTags(doc, loadedImgs) {
        if (loadedImgs) {
            images = loadedImgs;
        }
        else {
            images = doc.querySelectorAll('.thumb img[src]');
        }

        images.forEach(image => {
            if (!loadedImgs) {
                allImages.push(image);
            }

            let tags = '';
            if (hardSearch) {
                tags = image.title.trim().split(' ');
            } else {
                tags = image.title;
            }

            var positived;

            if (orMode) {
                positived = false;
                searchTags.forEach(tag => {
                    if (tags.includes(tag)) {
                        positived = true;
                    }
                });
            }
            else {
                positived = true;
                searchTags.forEach(tag => {
                    if (!tags.includes(tag)) {
                        positived = false;
                    }
                });
            }

            if (searchTags.length == 0) {
                positived = true;
            }

            if (positived) {
                var negatived = false;
                negativeTags.forEach(ntag => {
                    if (tags.includes(ntag)) {
                        negatived = true;
                    }
                });

                if (!negatived) {

                    if (loadedImgs) {
                        results.push({
                            link: image.link,
                            src: image.src,
                            id: image.link.split('id=')[1],
                            video: image.title.trim().split(' ').includes('video')
                        });
                    }
                    else {
                        const imageId = image.src.split('?')[1];
                        const postLink = `index.php?page=post&s=view&id=${imageId}`
                        results.push({
                            link: postLink,
                            src: image.src,
                            id: imageId,
                            video: image.title.trim().split(' ').includes('video')
                        });
                    }

                }
            }
        });
        if (!loadedImgs && images.length) {
            lastImageId = images[images.length - 1].src.split('?')[1];
        }
    }

    function loadAllPages() {
        extractImagesAndTags(false, loadedImages);
        displayResultsInModal();
    }

    async function searchAllPages(startPage = 0) {

        const totalPages = Math.ceil(actualFavCount / 50);
        const fetchPromises = [];
        let loadedPages = startPage;

        const maxConcurrentRequests = 9;
        let activeRequests = 0;

        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function fetchAndExtract(page, attempt = 0) {
            while (activeRequests >= maxConcurrentRequests) {
                await delay(100);
            }

            activeRequests++;
            const delayTime = attempt > 0 ? Math.pow(2, attempt) * 100 : page * 50;
            await delay(delayTime);
            const doc = await fetchFavoritesPage(page);

            if (doc) {
                await extractImagesAndTags(doc);
            }

            let retryCount = 0;
            while (images.length === 0 && retryCount < 5) {
                const retryDelay = Math.pow(2, retryCount) * 100;
                await delay(retryDelay);
                const retryDoc = await fetchFavoritesPage(page);
                if (retryDoc) {
                    await extractImagesAndTags(retryDoc);
                }
                retryCount++;
            }

            if (images.length > 0) {
                loadedPages++;
            }

            document.getElementById('progress').innerHTML = `scanning: ${loadedPages} / ${totalPages}&nbsp;&nbsp;(full)`;

            activeRequests--;
        }

        for (let page = startPage; page < totalPages; page++) {
            fetchPromises.push(fetchAndExtract(page));
        }

        await Promise.all(fetchPromises);

        displayResultsInModal();
    }

    async function searchNewPages() {

        const totalPages = Math.min(10, Math.ceil(actualFavCount / 50));
        const fetchPromises = [];
        let loadedPages = 0;

        const maxConcurrentRequests = 9;
        let activeRequests = 0;

        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function fetchAndExtract(page, attempt = 0) {
            while (activeRequests >= maxConcurrentRequests) {
                await delay(100);
            }

            activeRequests++;
            const delayTime = attempt > 0 ? Math.pow(2, attempt) * 100 : page * 50;
            await delay(delayTime);
            const doc = await fetchFavoritesPage(page);

            if (doc) {
                await extractImagesAndTags(doc);
            }

            let retryCount = 0;
            while (images.length === 0 && retryCount < 5) {
                const retryDelay = Math.pow(2, retryCount) * 100;
                await delay(retryDelay);
                const retryDoc = await fetchFavoritesPage(page);
                if (retryDoc) {
                    await extractImagesAndTags(retryDoc);
                }
                retryCount++;
            }

            if (images.length > 0) {
                loadedPages++;
            }

            document.getElementById('progress').textContent = `scanning: ${loadedPages} / ${totalPages}`;
            activeRequests--;
        }

        for (let page = 0; page < totalPages; page++) {
            fetchPromises.push(fetchAndExtract(page));
        }

        await Promise.all(fetchPromises);


        const lastResultId = lastImageId;
        const indexToDelete = loadedImages.findIndex(item => item.link.split('id=')[1] === lastResultId);
        if (indexToDelete !== -1) {
            loadedImages.splice(0, indexToDelete + 1);
            extractImagesAndTags(false, loadedImages);
            appendLoadedSave = true;
            displayResultsInModal();
        }
        else {
            await delay(100);
            searchAllPages(10);
        }
    }


    function displayResultsInModal(tabTitle = 'Fav Search', columnWidth = 250) {
        document.body.innerHTML = '';

        localStorage.setItem('inputTags', JSON.stringify(inputTags));
        localStorage.setItem('prevFavCount', JSON.stringify(actualFavCount));
        localStorage.setItem('prevId', JSON.stringify(userId));
        if (needScan) {
            saveAllImagesToLocalStorage();
        }

        const existingResultContainer = document.querySelector('#resultContainer');
        if (existingResultContainer) {
            existingResultContainer.remove();
        }

        let removeLabelsShown = false;

        const resultContainer = document.createElement('div');
        resultContainer.id = 'resultContainer';
        resultContainer.style.width = '100%';
        resultContainer.style.height = '100vh';
        resultContainer.style.backgroundColor = '#AAE5A4';
        resultContainer.style.color = 'white';
        resultContainer.style.overflowY = 'auto';
        resultContainer.style.zIndex = '10000';
        resultContainer.style.padding = '20px';
        resultContainer.style.boxSizing = 'border-box';
        resultContainer.style.display = 'flex';
        resultContainer.style.flexWrap = 'wrap';
        resultContainer.style.justifyContent = 'flex-start';
        resultContainer.style.alignContent = 'flex-start';
        resultContainer.style.alignItems = 'flex-start';


        function createHeaderContainer() {
            const headerContainer = document.createElement('div');
            headerContainer.style.width = '100%';
            headerContainer.style.display = 'flex';
            headerContainer.style.flexDirection = 'column';
            headerContainer.style.alignItems = 'flex-start';

            const imageCount = document.createElement('div');
            imageCount.textContent = `Number of images: ${results.length}`;
            imageCount.style.fontFamily = 'Verdana, sans-serif';
            imageCount.style.fontSize = '20px';
            imageCount.style.fontWeight = 'bold';
            imageCount.style.color = 'black';
            imageCount.style.textAlign = 'left';
            imageCount.style.marginBottom = '10px';

            const controlsContainer = document.createElement('div');
            controlsContainer.style.width = '100%';
            controlsContainer.style.display = 'flex';
            controlsContainer.style.alignItems = 'center';

            const toggleRemoveLabelContainer = document.createElement('div');
            toggleRemoveLabelContainer.style.display = 'flex';
            toggleRemoveLabelContainer.style.alignItems = 'center';

            const toggleRemoveLabelCheckbox = document.createElement('input');
            toggleRemoveLabelCheckbox.type = 'checkbox';
            toggleRemoveLabelCheckbox.id = 'toggleRemoveLabelCheckbox';
            toggleRemoveLabelCheckbox.style.marginRight = '10px';
            toggleRemoveLabelCheckbox.onchange = () => {
                removeLabelsShown = !removeLabelsShown;
                const removeLabels = document.querySelectorAll('.removeLabel');
                removeLabels.forEach(label => {
                    label.style.display = toggleRemoveLabelCheckbox.checked ? 'inline' : 'none';
                });
            };

            const toggleRemoveLabelText = document.createElement('label');
            toggleRemoveLabelText.htmlFor = 'toggleRemoveLabelCheckbox';
            toggleRemoveLabelText.textContent = 'Show Remove Labels';
            toggleRemoveLabelText.style.color = 'black';
            toggleRemoveLabelText.style.fontFamily = 'Verdana, sans-serif';
            toggleRemoveLabelText.style.fontSize = '16px';
            toggleRemoveLabelText.style.fontWeight = 'bold';

            toggleRemoveLabelContainer.appendChild(toggleRemoveLabelCheckbox);
            toggleRemoveLabelContainer.appendChild(toggleRemoveLabelText);

            const randomizeButton = document.createElement('button');
            randomizeButton.textContent = 'Randomize';
            randomizeButton.style.backgroundColor = '#e26c5e';
            randomizeButton.style.color = 'white';
            randomizeButton.style.border = 'none';
            randomizeButton.style.padding = '5px 10px 3px 10px';
            randomizeButton.style.cursor = 'pointer';
            randomizeButton.style.borderRadius = '3px';
            randomizeButton.style.fontSize = '18px';
            randomizeButton.style.marginLeft = '20px';
            randomizeButton.onmouseover = () => {
                randomizeButton.style.backgroundColor = '#c45a4b';
            };
            randomizeButton.onmouseout = () => {
                randomizeButton.style.backgroundColor = '#e26c5e';
            };
            randomizeButton.onclick = () => {
                const shuffledResults = results.sort(() => 0.5 - Math.random());
                updateResults(shuffledResults, columnWidth);
            };

            controlsContainer.appendChild(toggleRemoveLabelContainer);
            controlsContainer.appendChild(randomizeButton);

            function updateLayout() {
                const screenWidth = window.innerWidth || document.documentElement.clientWidth;
                if (screenWidth >= 1010) {
                    randomizeButton.style.marginLeft = '50px';
                    headerContainer.style.flexDirection = 'row';
                    headerContainer.style.justifyContent = 'space-between';
                    headerContainer.style.alignItems = 'center';

                    imageCount.style.marginBottom = '0';
                    imageCount.style.marginLeft = '285px';
                    imageCount.style.transform = 'translateX(-50%)';

                    controlsContainer.style.flexDirection = 'row';
                    controlsContainer.style.justifyContent = 'flex-start';
                    controlsContainer.appendChild(imageCount);
                    toggleRemoveLabelText.textContent = 'Show Remove Labels';
                    toggleRemoveLabelContainer.style.marginLeft = '10px';

                    headerContainer.appendChild(controlsContainer);

                } else {
                    randomizeButton.style.marginLeft = '20px';
                    headerContainer.style.flexDirection = 'column';
                    headerContainer.style.alignItems = 'flex-start';

                    imageCount.style.marginBottom = '10px';
                    imageCount.style.transform = 'translateX(0%)';
                    imageCount.style.marginLeft = '0px';

                    controlsContainer.style.flexDirection = 'row';
                    controlsContainer.style.justifyContent = 'flex-start';
                    toggleRemoveLabelText.textContent = 'Remove Labels';
                    toggleRemoveLabelContainer.style.marginLeft = '0px';


                    headerContainer.appendChild(imageCount);
                    headerContainer.appendChild(controlsContainer);
                }
            }

            updateLayout();

            window.addEventListener('resize', updateLayout);

            return headerContainer;
        }

        const headerContainer = createHeaderContainer();
        resultContainer.appendChild(headerContainer);

        const spacer = document.createElement('div');
        spacer.style.width = '100%';
        spacer.style.height = '20px';
        resultContainer.appendChild(spacer);

        results.forEach(result => {
            appendResult(result);
        });

        const backButton = document.createElement('button');
        backButton.textContent = 'Back';
        backButton.style.position = 'fixed';
        backButton.style.top = '10px';
        backButton.style.right = '20px';
        backButton.style.backgroundColor = 'transparent';
        backButton.style.border = 'none';
        backButton.style.color = '#0b3d91';
        backButton.style.fontSize = '24px';
        backButton.style.fontWeight = 'bold';
        backButton.style.cursor = 'pointer';
        backButton.style.zIndex = '9999';
        backButton.addEventListener('mouseover', () => {
            backButton.style.color = '#660000';
        });
        backButton.addEventListener('mouseout', () => {
            backButton.style.color = '#0b3d91';
        });
        backButton.addEventListener('click', () => {
            localStorage.setItem('fromBack', JSON.stringify(true));
            location.reload();
        });
        document.body.appendChild(backButton);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                backButton.click();
            }
        });

        document.title = tabTitle || 'Results';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.height = '100vh';
        document.body.style.overflow = 'hidden';

        document.body.appendChild(resultContainer);

        function updateResults(shuffledResults, columnWidth) {
            resultContainer.querySelectorAll('.resultItem').forEach(item => item.remove());

            shuffledResults.forEach(result => {
                appendResult(result);
            });
        }

        function appendResult(result) {
            const resultItem = document.createElement('div');
            resultItem.className = 'resultItem';
            resultItem.style.textAlign = 'center';
            resultItem.style.width = `${columnWidth}px`;
            resultItem.style.margin = '10px';
            resultItem.style.alignSelf = 'flex-start';

            const removeLabel = document.createElement('a');
            removeLabel.href = '#';
            removeLabel.className = 'removeLabel';
            removeLabel.style.color = '#009';
            removeLabel.style.fontWeight = 'bold';
            removeLabel.style.textDecoration = 'none';
            removeLabel.style.fontFamily = 'Verdana, sans-serif';
            removeLabel.style.fontSize = '100%';
            removeLabel.style.display = removeLabelsShown ? 'inline' : 'none';
            removeLabel.onclick = () => {
                document.location = `index.php?page=favorites&s=delete&id=${result.id}`;
                return false;
            };
            removeLabel.textContent = 'Remove';

            const borderStyle = result.video ? 'border: 3px solid rgb(0, 0, 255);' : '';

            resultItem.innerHTML = `
        <a href="index.php?page=post&s=view&id=${result.id}" id="p${result.id}" target="_blank">
            <img src="${result.src}" title="" border="0" alt="" style="max-width: 100%; max-height: 100%; ${borderStyle}">
        </a><br>
    `;

            resultItem.appendChild(removeLabel);
            resultContainer.appendChild(resultItem);
        }

    }

    function init() {
        if (UseCustomIcon) {
            updateIcon('https://i.imgur.com/EtURK0r.png');
        }

        SearchInputModule.createSearchInput();


        getFavoritesCount(userId).then(favoritesCount => {
            actualFavCount = favoritesCount;

            loadAllImagesFromLocalStorage(function(loadedImgs) {
            loadedImages = loadedImgs;

            if (prevFavCount > 0 && loadedImages.length > 0) {


                let loadedFirstId = loadedImages[0].link.split('id=')[1];

                fetchFavoritesPage(0).then(pageDoc => {
                    let actualFirstId = pageDoc.querySelectorAll('.thumb img')[0].parentElement.href.split('id=')[1];
                    if ((loadedFirstId != actualFirstId) && !fromBack || (userId != prevId) || (favoritesCount != prevFavCount)) {
                        needScan = true;
                    }
                    if (!needScan) {
                        allImages = loadedImages;
                        document.getElementById('progress').textContent = 'scanned';
                    }
                });
            }
            else {
                needScan = true;
            }

        });
        });

    }


    init();


})();


/* lz-string.js - JavaScript compression and decompression using LZ-based algorithms. (c) 2013-2015 Pieroxy, MIT License */
var LZString=function(){function o(o,r){if(!t[o]){t[o]={};for(var n=0;n<o.length;n++)t[o][o.charAt(n)]=n}return t[o][r]}var r=String.fromCharCode,n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",t={},i={compressToBase64:function(o){if(null==o)return"";var r=i._compress(o,6,function(o){return n.charAt(o)});switch(r.length%4){default:case 0:return r;case 1:return r+"===";case 2:return r+"==";case 3:return r+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(e){return o(n,r.charAt(e))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(o){return null==o?"":""==o?null:i._decompress(o.length,16384,function(r){return o.charCodeAt(r)-32})},compressToUint8Array:function(o){for(var r=i.compress(o),n=new Uint8Array(2*r.length),e=0,t=r.length;t>e;e++){var s=r.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null===o||void 0===o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;t>e;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(o){return null==o?"":i._compress(o,6,function(o){return e.charAt(o)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(n){return o(e,r.charAt(n))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(o,r,n){if(null==o)return"";var e,t,i,s={},p={},u="",c="",a="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<o.length;i+=1)if(u=o.charAt(i),Object.prototype.hasOwnProperty.call(s,u)||(s[u]=f++,p[u]=!0),c=a+u,Object.prototype.hasOwnProperty.call(s,c))a=c;else{if(Object.prototype.hasOwnProperty.call(p,a)){if(a.charCodeAt(0)<256){for(e=0;h>e;e++)m<<=1,v==r-1?(v=0,d.push(n(m)),m=0):v++;for(t=a.charCodeAt(0),e=0;8>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;h>e;e++)m=m<<1|t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=a.charCodeAt(0),e=0;16>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}l--,0==l&&(l=Math.pow(2,h),h++),delete p[a]}else for(t=s[a],e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;l--,0==l&&(l=Math.pow(2,h),h++),s[c]=f++,a=String(u)}if(""!==a){if(Object.prototype.hasOwnProperty.call(p,a)){if(a.charCodeAt(0)<256){for(e=0;h>e;e++)m<<=1,v==r-1?(v=0,d.push(n(m)),m=0):v++;for(t=a.charCodeAt(0),e=0;8>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;h>e;e++)m=m<<1|t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=a.charCodeAt(0),e=0;16>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}l--,0==l&&(l=Math.pow(2,h),h++),delete p[a]}else for(t=s[a],e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;l--,0==l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==r-1){d.push(n(m));break}v++}return d.join("")},decompress:function(o){return null==o?"":""==o?null:i._decompress(o.length,32768,function(r){return o.charCodeAt(r)})},_decompress:function(o,n,e){var t,i,s,p,u,c,a,l,f=[],h=4,d=4,m=3,v="",w=[],A={val:e(0),position:n,index:1};for(i=0;3>i;i+=1)f[i]=i;for(p=0,c=Math.pow(2,2),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;switch(t=p){case 0:for(p=0,c=Math.pow(2,8),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;l=r(p);break;case 1:for(p=0,c=Math.pow(2,16),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;l=r(p);break;case 2:return""}for(f[3]=l,s=l,w.push(l);;){if(A.index>o)return"";for(p=0,c=Math.pow(2,m),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;switch(l=p){case 0:for(p=0,c=Math.pow(2,8),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;f[d++]=r(p),l=d-1,h--;break;case 1:for(p=0,c=Math.pow(2,16),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;f[d++]=r(p),l=d-1,h--;break;case 2:return w.join("")}if(0==h&&(h=Math.pow(2,m),m++),f[l])v=f[l];else{if(l!==d)return null;v=s+s.charAt(0)}w.push(v),f[d++]=s+v.charAt(0),h--,s=v,0==h&&(h=Math.pow(2,m),m++)}}};return i}();"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module&&(module.exports=LZString);


