#!/usr/bin/env python3
"""Bundle the ES-module app into one self-contained HTML file (for previews/artifacts).
The real site is index.html + js/ + css/, served as-is from GitHub Pages."""
import re, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / 'rainbow.html'

def strip_imports(src):
    return re.sub(r'^import .*?;\s*$', '', src, flags=re.M)

def as_plain(src):
    return re.sub(r'^export ', '', strip_imports(src), flags=re.M)

def as_module_object(name, src):
    src = strip_imports(src)
    names = re.findall(r'^export (?:const|let|function) (\w+)', src, flags=re.M)
    body = re.sub(r'^export ', '', src, flags=re.M)
    return f"const {name} = (() => {{\n{body}\nreturn {{ {', '.join(names)} }};\n}})();\n"

js = [as_plain((root / 'js/physics.js').read_text()), as_plain((root / 'js/draw.js').read_text()), as_plain((root / 'js/scene3d.js').read_text())]
for st in ['rain', 'sky', 'orbit', 'drop', 'wave']:   # order matters: sky uses rain's layout, orbit uses sky's geometry
    js.append(as_module_object(st, (root / f'js/stages/{st}.js').read_text()))
js.append(strip_imports((root / 'js/main.js').read_text()))
css = (root / 'css/app.css').read_text()
html = (root / 'v1' / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="../css/app.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="../js/main.js"></script>', '<script>\n' + '\n'.join(js) + '\n</script>')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
print(out, len(html), 'bytes')
