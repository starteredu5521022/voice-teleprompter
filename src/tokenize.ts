// CJK-aware tokenization.
//
// The upstream matching logic assumes whitespace-delimited languages (English,
// European languages). Chinese/Japanese/Korean text has no spaces between
// words, so a plain `.split(/\s+/)` treats an entire CJK sentence as one
// "word" and voice matching never advances. This splits CJK character runs
// into individual characters while leaving whitespace-delimited runs
// (English, numbers, punctuation-attached tokens) intact, so mixed
// Chinese/English scripts and speech both tokenize at a granularity fine
// enough to match.
const CJK_CHAR = /[一-鿿㐀-䶿豈-﫿぀-ヿ가-힯]/;

export function isCJKChar(str: string): boolean {
    return str.length === 1 && CJK_CHAR.test(str);
}

export function tokenizeWords(text: string): string[] {
    const out: string[] = [];
    for (const rawToken of text.split(/\s+/)) {
        if (!rawToken) continue;
        if (!CJK_CHAR.test(rawToken)) {
            out.push(rawToken);
            continue;
        }
        let buf = '';
        for (const ch of rawToken) {
            if (CJK_CHAR.test(ch)) {
                if (buf) {
                    out.push(buf);
                    buf = '';
                }
                out.push(ch);
            } else {
                buf += ch;
            }
        }
        if (buf) out.push(buf);
    }
    return out;
}
