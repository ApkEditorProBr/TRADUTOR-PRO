const fileInput = document.getElementById('fileInput');
const stringList = document.getElementById('stringList');
const eventList = document.getElementById('eventList');
const translateBtn = document.getElementById('translateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const toLangSelect = document.getElementById('toLang');
const loadingScreen = document.getElementById('loadingScreen');
const loadingText = document.getElementById('loadingText');

function toggleTheme() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark');
  }
});

let originalText = '';
let detectedLanguage = '';
let doc = null;
let docTextNodes = [];
let docAttrEntries = [];

window.addEventListener('DOMContentLoaded', () => {
  const userLang = navigator.language || navigator.userLanguage;
  const shortLang = userLang.split('-')[0];
  const supported = ["en","pt","es","fr","de","ja","zh","ar","af","ru","it","nl","ko","hi","sv","da","no","pl","tr","cs","el","th","id","vi","sw","fa","he","uk","ms","tl","bn","pa","mr","ta","te","gu","kn","ml","or","as","si","km","my","lo","ne","sr","hr","bs","mk","sq","mt","cy","eu","is","lv","lt","et","fi","hu","ro","bg","sr","sk","sl","hr","ka","sq","hy","be","cy","ka"];
  toLangSelect.value = supported.includes(shortLang) ? shortLang : 'en';
});

async function detectLanguage(text) {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 400))}&langpair=auto|en`);
    const data = await res.json();
    return data.responseData.detectedSourceLanguage || 'en';
  } catch {
    return 'en';
  }
}

function createItem(str) {
  const item = document.createElement('div');
  item.className = 'item';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = str;
  input.style.overflowX = 'auto';
  input.style.whiteSpace = 'nowrap';
  input.style.textOverflow = 'clip';

  const lockLabel = document.createElement('label');
  lockLabel.className = 'lock-label';
  lockLabel.style.userSelect = 'none';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  lockLabel.appendChild(checkbox);
  const labelText = document.createElement('span');
  labelText.textContent = 'Bloquear tradução';
  lockLabel.appendChild(labelText);

  checkbox.addEventListener('change', () => {
    input.readOnly = checkbox.checked;
    input.classList.toggle('locked', checkbox.checked);
  });

  item.appendChild(input);
  item.appendChild(lockLabel);
  return item;
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  originalText = text;
  detectedLanguage = await detectLanguage(text);

  const parser = new DOMParser();
  doc = parser.parseFromString(text, 'text/html');

  docTextNodes = [];
  function getTextNodes(node) {
    for (let child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const clean = child.textContent.trim();
        if (clean.length > 1 && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(clean)) {
          if (!docTextNodes.some(n => n.text === clean)) {
            docTextNodes.push({ node: child, text: clean });
          }
        }
      } else {
        getTextNodes(child);
      }
    }
  }
  getTextNodes(doc.body);

  stringList.innerHTML = '';
  docTextNodes.forEach((entry, idx) => {
    const item = createItem(entry.text);
    item.querySelector('input[type="text"]').dataset.nodeIndex = idx;
    stringList.appendChild(item);
  });

  docAttrEntries = [];
  const elementsWithAttrs = doc.querySelectorAll('[onclick], [onmouseover], [onchange], [oninput], [onfocus], [onblur]');
  elementsWithAttrs.forEach(el => {
    for (let attr of el.attributes) {
      if (/^on/i.test(attr.name)) {
        const matches = [...attr.value.matchAll(/\(\s*['"]([^'"]+)['"]\s*\)/g)];
        if (matches.length) {
          matches.forEach(m => {
            const txt = m[1].trim();
            if (txt && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(txt)) {
              if (!docAttrEntries.some(a => a.value === txt && a.attrName === attr.name && a.el === el)) {
                docAttrEntries.push({ el, attrName: attr.name, value: txt });
              }
            }
          });
        }
      }
    }
  });

  eventList.innerHTML = '';
  docAttrEntries.forEach((entry, idx) => {
    const item = createItem(entry.value);
    item.querySelector('input[type="text"]').dataset.attrIndex = idx;
    eventList.appendChild(item);
  });

  document.querySelectorAll('.section-title')[1].textContent = `Textos em atributos: ${docAttrEntries.length}`;
  document.querySelector('.section-title').textContent = `Strings encontradas: ${docTextNodes.length}`;
});

translateBtn.addEventListener('click', async () => {
  const textInputs = Array.from(stringList.querySelectorAll('input[type="text"]'));
  const attrInputs = Array.from(eventList.querySelectorAll('input[type="text"]'));
  const allInputs = [...textInputs, ...attrInputs];

  const checkboxes = Array.from(document.querySelectorAll('.result input[type="checkbox"]'));
  const total = allInputs.length;
  if (total === 0) {
    alert('Nenhuma string encontrada.');
    return;
  }

  const fromLang = detectedLanguage || 'en';
  const toLang = toLangSelect.value || 'pt';

  if (fromLang === toLang) {
    alert(`O arquivo e o idioma de destino estão iguais (${toLang}). Escolha outro idioma.`);
    return;
  }

  loadingScreen.style.display = 'flex';
  let completed = 0;

  for (let i = 0; i < total; i++) {
    const input = allInputs[i];
    const isLocked = checkboxes[i]?.checked;
    if (isLocked || !input.value.trim()) continue;

    const original = input.value.trim();

    try {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(original)}`
      );
      const data = await res.json();
      const translated = data?.[0]?.map(t => t[0]).join(' ') || original;
      input.value = translated;

      const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let found = false;
      while (walker.nextNode()) {
        const nodeText = walker.currentNode.textContent.trim();
        if (nodeText === original) {
          walker.currentNode.textContent = translated;
          found = true;
          break;
        }
      }

      if (!found) {
        const elementsWithAttrs = doc.querySelectorAll('[onclick], [onmouseover], [onchange], [oninput], [onfocus], [onblur]');
        elementsWithAttrs.forEach(el => {
          for (let attr of el.attributes) {
            if (/^on/i.test(attr.name) && attr.value.includes(original)) {
              el.setAttribute(attr.name, attr.value.replace(original, translated));
            }
          }
        });
      }
    } catch (err) {
      console.error('Erro ao traduzir:', err);
    }

    completed++;
    const percent = Math.round((completed / total) * 100);
    loadingText.textContent = `Traduzindo ${percent}%`;
  }

  loadingScreen.style.display = 'none';
  const toast = document.createElement('div');
  toast.innerHTML = '✅ <b>Tradução concluída!</b>';
  Object.assign(toast.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -40%)',
    background: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    padding: '14px 24px',
    borderRadius: '10px',
    fontSize: '15px',
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 0.35s ease, transform 0.35s ease',
    pointerEvents: 'none',
    textAlign: 'center',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, -50%)';
  }, 50);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, -40%)';
    setTimeout(() => toast.remove(), 350);
  }, 1800);
});

downloadBtn.addEventListener('click', () => {
  if (!doc) {
    alert('⚠️ Carregue e traduza um arquivo primeiro!');
    return;
  }

  const textInputs = Array.from(stringList.querySelectorAll('input[type="text"]'));
  const attrInputs = Array.from(eventList.querySelectorAll('input[type="text"]'));
  const allInputs = [...textInputs, ...attrInputs];

  let output = originalText;

  allInputs.forEach(input => {
    const edited = input.value;
    const nodeIndex = input.dataset.nodeIndex;
    const attrIndex = input.dataset.attrIndex;

    if (nodeIndex !== undefined) {
      const entry = docTextNodes[Number(nodeIndex)];
      if (entry) {
        output = replaceFirst(output, entry.text, edited);
      }
    } else if (attrIndex !== undefined) {
      const entry = docAttrEntries[Number(attrIndex)];
      if (entry) {
        output = replaceFirst(output, entry.value, edited);
      }
    }
  });

  const blob = new Blob([output], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (fileInput.files[0]?.name?.replace(/\.[^/.]+$/, '') || 'arquivo') + '_editado.html';
  a.click();
});

function replaceFirst(str, search, replace) {
  if (!search) return str;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(\\b)${escaped}(\\b)`);
  return str.replace(regex, `$1${replace}$2`);
}
