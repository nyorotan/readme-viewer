document.addEventListener('DOMContentLoaded', async () => {
    // 右クリックの無効化
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    const params = new URLSearchParams(window.location.search);
    const file = params.get('file') || 'README.md';
    await loadMarkdownFile(file);
    initSearch();
    initMenubar();
});

async function loadMarkdownFile(file) {
    try {
        const res = await fetch(`/api/markdown?file=${encodeURIComponent(file)}`);
        if (!res.ok) throw new Error('ファイルが見つかりません');
        
        const data = await res.json();
        const viewer = document.getElementById('viewer');
        if (!viewer) {
            throw new Error('ビューア要素が見つかりません');
        }
        originalViewerHTML = ''; // 新しいファイルを読み込む際に検索状態をリセット
        viewer.innerHTML = data.html;
        prepareRelativeContent(viewer, file);
        await renderSidebarTree(viewer, file);
    } catch (err) {
        const viewer = document.getElementById('viewer');
        if (viewer) {
            viewer.innerHTML = `<p style="color:red;">エラー: ${err.message}</p>`;
        }
    }
}

function prepareRelativeContent(contentElement, currentFile) {
    contentElement.querySelectorAll('a').forEach((link) => {
        const rawHref = link.getAttribute('href');
        if (!rawHref || rawHref.startsWith('#') || /^([a-z]+:)?\/\//i.test(rawHref) || /^[a-z]+:/i.test(rawHref)) {
            return;
        }

        const targetPath = resolveRelativePath(currentFile, rawHref);
        if (!targetPath) return;

        if (isMarkdownTarget(targetPath)) {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                window.location.href = `/?file=${encodeURIComponent(targetPath)}`;
            });
        }
    });

    contentElement.querySelectorAll('img').forEach((img) => {
        const rawSrc = img.getAttribute('src');
        if (!rawSrc || /^([a-z]+:)?\/\//i.test(rawSrc) || /^[a-z]+:/i.test(rawSrc)) {
            return;
        }

        const targetPath = resolveRelativePath(currentFile, rawSrc);
        if (!targetPath) return;

        img.setAttribute('src', `/api/file?file=${encodeURIComponent(targetPath)}`);
    });
}

function resolveRelativePath(currentFile, targetPath) {
    const cleanCurrent = currentFile.replace(/\\/g, '/');
    const cleanTarget = targetPath.replace(/\\/g, '/');
    const [pathOnly] = cleanTarget.split('#');

    const currentDir = cleanCurrent.split('/').slice(0, -1).join('/');
    const base = pathOnly.startsWith('/') ? pathOnly.slice(1) : (currentDir ? `${currentDir}/${pathOnly}` : pathOnly);

    const segments = [];
    base.split('/').forEach((segment) => {
        if (!segment || segment === '.') {
            return;
        }
        if (segment === '..') {
            segments.pop();
            return;
        }
        segments.push(segment);
    });

    return segments.join('/');
}

function isMarkdownTarget(targetPath) {
    return /\.(md|markdown|mdown|mkd)$/i.test(targetPath);
}

async function renderSidebarTree(viewer, currentFile) {
    const sidebarTree = document.getElementById('sidebar-tree') || document.getElementById('toc');
    if (!sidebarTree) return;

    try {
        // 同一フォルダ内のマークダウンファイル一覧を取得
        const res = await fetch(`/api/list?file=${encodeURIComponent(currentFile)}`);
        if (!res.ok) throw new Error('ファイル一覧の取得に失敗しました');
        const data = await res.json();
        
        allFiles = data.files || []; // 横断検索用にファイル一覧を保持
        
        sidebarTree.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'sidebar-file-list';
        sidebarTree.appendChild(ul);

        // 現在のドキュメントの見出しを解析
        const tocNodes = parseTOC(viewer);

        data.files.forEach((entry) => {
            const li = document.createElement('li');
            li.className = 'file-node';

            const details = document.createElement('details');
            const isActive = entry === currentFile;
            details.open = isActive;

            const summary = document.createElement('summary');
            summary.className = isActive ? 'file-summary active-file' : 'file-summary';

            // 最上位ファイルノードのマーカーは「○」
            const marker = document.createElement('span');
            marker.className = 'file-marker';
            marker.textContent = '○';

            const title = document.createElement('span');
            title.className = 'file-title';
            title.textContent = entry;

            // ファイル名をクリックした場合は該当ファイルへ遷移
            title.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!isActive) {
                    window.location.href = `/?file=${encodeURIComponent(entry)}`;
                }
            });

            summary.appendChild(marker);
            summary.appendChild(title);
            details.appendChild(summary);

            // アクティブなファイルの場合のみ見出しツリーを子として展開
            if (isActive && tocNodes.length > 0) {
                const tocContainer = document.createElement('div');
                tocContainer.className = 'toc';
                renderTocTree(tocContainer, tocNodes);
                details.appendChild(tocContainer);
            }

            li.appendChild(details);
            ul.appendChild(li);
        });
    } catch (err) {
        sidebarTree.innerHTML = `<div style="color:#ff3333;font-size:12px;">エラー: ${err.message}</div>`;
    }
}

function parseTOC(contentElement) {
    const headings = Array.from(contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) {
        return [];
    }

    const root = { level: 0, children: [] };
    const stack = [root];

    headings.forEach((heading, i) => {
        if (!heading.id) {
            heading.id = `heading-${i}`;
        }

        const level = parseInt(heading.tagName[1], 10);
        const node = { level, id: heading.id, title: heading.textContent.trim(), heading, children: [] };

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        stack[stack.length - 1].children.push(node);
        stack.push(node);
    });

    return root.children;
}

function renderTocTree(container, nodes) {
    const ul = document.createElement('ul');
    container.appendChild(ul);

    nodes.forEach((node) => {
        const li = document.createElement('li');
        const details = document.createElement('details');
        const hasChildren = node.children && node.children.length > 0;
        // デフォルトではH2レベルまで展開
        details.open = node.level <= 2 && hasChildren;

        const summary = document.createElement('summary');
        summary.className = hasChildren ? 'toc-summary' : 'toc-summary toc-summary-leaf';

        // 子がある場合は「▲」、ない場合は「●」
        const marker = document.createElement('span');
        marker.className = 'toc-marker';
        marker.textContent = hasChildren ? '▲' : '●';

        const title = document.createElement('span');
        title.className = 'toc-title';
        title.textContent = node.title;
        
        // 文字をクリックしたときはスクロールし、親summaryによる開閉（トグル）を防ぐ
        title.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            node.heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        summary.appendChild(marker);
        summary.appendChild(title);

        // マーカー（▲）をクリックしたときのみ展開トグルを許可。
        // 子がない場合はそもそもトグル自体を行わない。
        summary.addEventListener('click', (event) => {
            if (!hasChildren) {
                event.preventDefault();
            }
            event.stopPropagation();
        });

        details.appendChild(summary);
        li.appendChild(details);

        if (hasChildren) {
            const childContainer = document.createElement('div');
            renderTocTree(childContainer, node.children);
            details.appendChild(childContainer);
        }

        ul.appendChild(li);
    });
}

// --- 文章内検索機能 ---
let allFiles = []; // 同一ディレクトリ内のファイルリスト
let searchMatches = [];
let currentMatchIndex = -1;
let originalViewerHTML = '';

function initSearch() {
    const input = document.getElementById('search-input');
    const prevBtn = document.getElementById('search-prev');
    const nextBtn = document.getElementById('search-next');
    const allFilesCheckbox = document.getElementById('search-all-files');
    const submitBtn = document.getElementById('search-submit-btn');

    if (!input || !prevBtn || !nextBtn || !allFilesCheckbox) return;

    // URLパラメータから前回の検索条件を復元
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get('q') || '';
    const searchAllParam = params.get('searchAll') === 'true';
    const dirParam = params.get('dir') || 'next';
    const fromParam = params.get('from') || '';

    if (searchAllParam) {
        allFilesCheckbox.checked = true;
    }

    if (qParam) {
        input.value = qParam;
        performSearch(qParam);

        // 横断検索中で、このファイル内に一致が見つからなかった場合は自動で次のファイルを探索
        if (searchMatches.length === 0 && searchAllParam) {
            navigateToNextFileWithSearch(qParam, dirParam, fromParam || params.get('file') || 'README.md');
            return;
        }

        if (searchMatches.length > 0) {
            if (dirParam === 'prev') {
                currentMatchIndex = searchMatches.length - 1;
            } else {
                currentMatchIndex = 0;
            }
            highlightMatch(currentMatchIndex);
            updateSearchUI();
        }
    }

    input.addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    prevBtn.addEventListener('click', () => {
        if (allFilesCheckbox.checked) {
            // 横断検索チェックONで、かつ検索結果が0件、または最初のマッチからさらに「前へ」行く場合
            if (searchMatches.length === 0 || currentMatchIndex === 0) {
                navigateToNextFileWithSearch(input.value, 'prev', fromParam || params.get('file') || 'README.md');
                return;
            }
        }
        if (searchMatches.length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
        highlightMatch(currentMatchIndex);
        updateSearchUI();
    });

    nextBtn.addEventListener('click', () => {
        if (allFilesCheckbox.checked) {
            // 横断検索チェックONで、かつ検索結果が0件、または最後のマッチからさらに「次へ」行く場合
            if (searchMatches.length === 0 || currentMatchIndex === searchMatches.length - 1) {
                navigateToNextFileWithSearch(input.value, 'next', fromParam || params.get('file') || 'README.md');
                return;
            }
        }
        if (searchMatches.length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
        highlightMatch(currentMatchIndex);
        updateSearchUI();
    });

    // Enterキーまたは虫眼鏡クリックで検索を実行（次のマッチまたはファイル遷移）
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            triggerSearchSubmit();
        }
    });

    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            triggerSearchSubmit();
        });
    }
}

function triggerSearchSubmit() {
    const input = document.getElementById('search-input');
    const allFilesCheckbox = document.getElementById('search-all-files');
    if (!input || !allFilesCheckbox) return;

    const query = input.value;
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get('from') || '';

    if (allFilesCheckbox.checked) {
        if (searchMatches.length === 0 || currentMatchIndex === searchMatches.length - 1) {
            navigateToNextFileWithSearch(query, 'next', fromParam || params.get('file') || 'README.md');
            return;
        }
    }
    if (searchMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    highlightMatch(currentMatchIndex);
    updateSearchUI();
}

function navigateToNextFileWithSearch(query, direction, fromFile) {
    if (!query || query.trim() === '') return;
    if (allFiles.length <= 1) return;

    const params = new URLSearchParams(window.location.search);
    const currentFile = params.get('file') || 'README.md';

    const currentIndex = allFiles.indexOf(currentFile);
    if (currentIndex === -1) return;

    let nextIndex;
    if (direction === 'next') {
        nextIndex = (currentIndex + 1) % allFiles.length;
    } else {
        nextIndex = (currentIndex - 1 + allFiles.length) % allFiles.length;
    }

    const nextFile = allFiles[nextIndex];

    // 起点ファイルに一周して戻ってきた場合は、これ以上見つからなかったとして終了
    if (nextFile === fromFile) {
        alert('すべてのドキュメントを検索しましたが、これ以上の一致は見つかりませんでした。');
        // 起点ファイルへ戻す（横断検索はOFFにする）
        window.location.href = `/?file=${encodeURIComponent(fromFile)}&q=${encodeURIComponent(query)}&searchAll=false`;
        return;
    }

    // 次のファイルへクエリ情報を持たせて遷移
    const newParams = new URLSearchParams();
    newParams.set('file', nextFile);
    newParams.set('q', query);
    newParams.set('searchAll', 'true');
    newParams.set('dir', direction);
    newParams.set('from', fromFile);

    window.location.href = `/?${newParams.toString()}`;
}

function performSearch(query) {
    const viewer = document.getElementById('viewer');
    if (!viewer) return;

    // 前回の検索ハイライトをクリアして元のHTMLを復元
    if (originalViewerHTML) {
        viewer.innerHTML = originalViewerHTML;
    } else {
        originalViewerHTML = viewer.innerHTML;
    }

    searchMatches = [];
    currentMatchIndex = -1;

    if (!query || query.trim() === '') {
        originalViewerHTML = '';
        updateSearchUI();
        return;
    }

    // テキストノードを再帰的に走査
    const walk = document.createTreeWalker(viewer, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while (node = walk.nextNode()) {
        if (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE') {
            continue;
        }
        textNodes.push(node);
    }

    const escapedQuery = escapeHTML(query);
    const regex = new RegExp(`(${escapeRegExp(escapedQuery)})`, 'gi');

    // DOM構造が崩れないように逆順で置換を行う
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const textNode = textNodes[i];
        const val = textNode.nodeValue;
        const escapedVal = escapeHTML(val);

        if (regex.test(escapedVal)) {
            const parent = textNode.parentNode;
            const temp = document.createElement('div');
            temp.innerHTML = escapedVal.replace(regex, '<mark class="search-highlight">$1</mark>');
            
            while (temp.firstChild) {
                parent.insertBefore(temp.firstChild, textNode);
            }
            parent.removeChild(textNode);
        }
    }

    // ハイライトされた要素の一覧を取得
    searchMatches = Array.from(viewer.querySelectorAll('.search-highlight'));
    if (searchMatches.length > 0) {
        currentMatchIndex = 0;
        highlightMatch(currentMatchIndex);
    }
    updateSearchUI();
}

function highlightMatch(index) {
    searchMatches.forEach((el, i) => {
        if (i === index) {
            el.classList.add('search-highlight-active');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            el.classList.remove('search-highlight-active');
        }
    });
}

function updateSearchUI() {
    const input = document.getElementById('search-input');
    const status = document.getElementById('search-status');
    const prevBtn = document.getElementById('search-prev');
    const nextBtn = document.getElementById('search-next');
    const allFilesCheckbox = document.getElementById('search-all-files');

    if (!input || !status || !prevBtn || !nextBtn || !allFilesCheckbox) return;

    if (searchMatches.length === 0) {
        status.textContent = input.value.trim() ? '見つかりませんでした' : '';
        // 横断検索がONの場合は、0件であっても「次へ」「前へ」ボタンで別のファイルへ遷移できるように活性化しておく
        prevBtn.disabled = !allFilesCheckbox.checked;
        nextBtn.disabled = !allFilesCheckbox.checked;
    } else {
        status.textContent = `${currentMatchIndex + 1} / ${searchMatches.length}`;
        prevBtn.disabled = false;
        nextBtn.disabled = false;
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHTML(string) {
    return string
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function initMenubar() {
    const backBtn = document.getElementById('menu-back');
    const forwardBtn = document.getElementById('menu-forward');
    const reloadBtn = document.getElementById('menu-reload');
    const aboutBtn = document.getElementById('menu-about');
    const modal = document.getElementById('about-modal');
    const closeBtn = modal ? modal.querySelector('.close-btn') : null;

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.back();
        });
    }

    if (forwardBtn) {
        forwardBtn.addEventListener('click', () => {
            history.forward();
        });
    }

        if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            location.reload();
        });
    }

    const printBtn = document.getElementById('menu-print');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    if (aboutBtn && modal) {
        aboutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = 'block';
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    if (modal) {
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}
