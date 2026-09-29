"""Pravi Android aplikaciju dist/RakiJA.apk od web fajlova RakiJA.

Pokretanje (iz foldera RakiJA):  python android/build.py

Treba (bez instalacije, raspakovano u %LOCALAPPDATA%\\RakiJA-toolchain ili
folder iz RAKIJA_TOOLCHAIN): JDK 17, Android build-tools 34 i platform 34.
Ključ za potpis je u android/keystore/ — ČUVAJ GA: bez istog ključa telefon
neće prihvatiti novu verziju preko stare (morala bi se brisati, a s njom i
sačuvana mjerenja).
"""
import os
import re
import secrets
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANDROID = ROOT / "android"
BUILD = ANDROID / "build"
DIST = ROOT / "dist"
KEYSTORE_DIR = ANDROID / "keystore"
KEYSTORE = KEYSTORE_DIR / "rakija.keystore"
PASSWORD_FILE = KEYSTORE_DIR / "lozinka.txt"
KEY_ALIAS = "rakija"

WEB_FILES = ["index.html", "styles.css", "alkohol.js", "app.js", "manifest.webmanifest"]
MIN_SDK, TARGET_SDK = 24, 34
# Verzija koja piše na početnom ekranu ("RakiJA 1.1") je i verzija APK-a.
VERSION_NAME = re.search(r"RakiJA (\d+(?:\.\d+)+)", (ROOT / "index.html").read_text("utf-8")).group(1)
VERSION_CODE = int("".join(f"{int(p):02d}" for p in (VERSION_NAME.split(".") + ["0"])[:3]))


def toolchain():
    base = Path(os.environ.get("RAKIJA_TOOLCHAIN", Path(os.environ["LOCALAPPDATA"]) / "RakiJA-toolchain"))
    def find(pattern):
        hits = sorted(base.glob(pattern))
        if not hits:
            sys.exit(f"Nema {pattern} u {base}")
        return hits[-1]
    jdk = find("jdk*/bin/javac.exe").parent
    build_tools = find("**/aapt2.exe").parent
    android_jar = find("**/android.jar")
    return jdk, build_tools, android_jar


def run(*cmd, env=None):
    print(">", " ".join(str(c) for c in cmd[:3]), "...")
    subprocess.run([str(c) for c in cmd], check=True, env=env)


def main():
    jdk, bt, android_jar = toolchain()
    env = dict(os.environ, JAVA_HOME=str(jdk.parent), PATH=str(jdk) + os.pathsep + os.environ["PATH"])

    shutil.rmtree(BUILD, ignore_errors=True)
    (BUILD / "assets" / "www").mkdir(parents=True)
    DIST.mkdir(exist_ok=True)

    # 1. Web fajlovi idu u assets/www.
    for name in WEB_FILES:
        shutil.copy2(ROOT / name, BUILD / "assets" / "www" / name)
    shutil.copytree(ROOT / "icons", BUILD / "assets" / "www" / "icons")

    # 2. Resursi (ikonice, tema) i manifest.
    run(bt / "aapt2.exe", "compile", "--dir", ANDROID / "res", "-o", BUILD / "res.zip")
    run(bt / "aapt2.exe", "link", "-o", BUILD / "base.apk", "-I", android_jar,
        "--manifest", ANDROID / "AndroidManifest.xml", "-R", BUILD / "res.zip",
        "-A", BUILD / "assets", "--auto-add-overlay",
        "--min-sdk-version", MIN_SDK, "--target-sdk-version", TARGET_SDK,
        "--version-code", VERSION_CODE, "--version-name", VERSION_NAME)

    # 3. Java -> .class -> classes.dex
    sources = list((ANDROID / "src").rglob("*.java"))
    run(jdk / "javac.exe", "--release", "11", "-encoding", "UTF-8", "-classpath", android_jar,
        "-d", BUILD / "classes", *sources, env=env)
    classes = list((BUILD / "classes").rglob("*.class"))
    (BUILD / "dex").mkdir()
    run(bt / "d8.bat", "--release", "--min-api", MIN_SDK, "--lib", android_jar,
        "--output", BUILD / "dex", *classes, env=env)
    # APK se slaže iznova (ne dopisuje u aapt2 fajl), da zaglavlja budu čista;
    # zadržava se način pakovanja, npr. resources.arsc mora ostati nekompresovan.
    with zipfile.ZipFile(BUILD / "base.apk") as src, \
            zipfile.ZipFile(BUILD / "unaligned.apk", "w") as dst:
        for info in src.infolist():
            dst.writestr(zipfile.ZipInfo(info.filename, info.date_time), src.read(info),
                         compress_type=info.compress_type)
        dst.write(BUILD / "dex" / "classes.dex", "classes.dex", compress_type=zipfile.ZIP_DEFLATED)

    # 4. Poravnanje i potpis.
    run(bt / "zipalign.exe", "-p", "-f", "4", BUILD / "unaligned.apk", BUILD / "aligned.apk")
    if not KEYSTORE.exists():
        KEYSTORE_DIR.mkdir(exist_ok=True)
        PASSWORD_FILE.write_text(secrets.token_urlsafe(18), "utf-8")
        run(jdk / "keytool.exe", "-genkeypair", "-keystore", KEYSTORE, "-alias", KEY_ALIAS,
            "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
            "-storepass", PASSWORD_FILE.read_text("utf-8"),
            "-dname", "CN=Veljko Trifunovic, O=RakiJA, C=RS", env=env)
    password = PASSWORD_FILE.read_text("utf-8").strip()
    out = DIST / "RakiJA.apk"
    run(bt / "apksigner.bat", "sign", "--ks", KEYSTORE, "--ks-key-alias", KEY_ALIAS,
        "--ks-pass", "pass:" + password, "--out", out, BUILD / "aligned.apk", env=env)
    run(bt / "apksigner.bat", "verify", "--min-sdk-version", MIN_SDK, out, env=env)
    print(f"Gotovo: {out} (verzija {VERSION_NAME}, {out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
