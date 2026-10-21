#!/usr/bin/env bash
# Compila el APK firmado y lo publica en apk.merxbit.com/ecoghost/.
#
#   ./release.sh prueba "Notas de la versión"   → ecoghost-prueba-<ver>.apk + prueba.json
#   ./release.sh real   "Notas de la versión"   → ecoghost-<ver>.apk + latest.json
#
# Requiere keystore.properties (firma, fuera de git) y local.properties (sdk.dir).
# Copiado de realtime-solar/android/release.sh.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
export ANDROID_HOME=${ANDROID_HOME:-/home/frank/android-sdk}
export ANDROID_SDK_ROOT=$ANDROID_HOME

CANAL="${1:-}"
NOTES="${2:-}"
case "$CANAL" in
  real)   TASK=assembleRealRelease;   OUT=real;   PREFIX=ecoghost;        JSON=latest.json; LATEST=latest.apk ;;
  prueba) TASK=assemblePruebaRelease; OUT=prueba; PREFIX=ecoghost-prueba; JSON=prueba.json; LATEST=ecoghost-prueba.apk ;;
  *) echo "Uso: $0 real|prueba \"notas\""; exit 1 ;;
esac
[ -f keystore.properties ] || { echo "Falta keystore.properties (firma)"; exit 1; }

VER=$(grep -oP 'versionName = "\K[^"]+' app/build.gradle.kts)
CODE=$(grep -oP 'versionCode = \K\d+' app/build.gradle.kts)
DEST=/home/frank/apk-public/ecoghost
BASE_URL=https://apk.merxbit.com/ecoghost

echo "== EcoGhost $CANAL v$VER (code $CODE)"
./gradlew --console=plain "$TASK"
APK=app/build/outputs/apk/$OUT/release/app-$OUT-release.apk
[ -f "$APK" ] || { echo "No se generó $APK"; exit 1; }

mkdir -p "$DEST"
# El APK se sube ANTES que el json: el updater nunca debe apuntar a un archivo inexistente.
cp "$APK" "$DEST/$PREFIX-$VER.apk"
cp "$APK" "$DEST/$LATEST"
python3 - "$DEST/$JSON" "$CODE" "$VER" "$BASE_URL/$PREFIX-$VER.apk" "$NOTES" <<'EOF'
import json, sys
path, code, ver, url, notes = sys.argv[1:]
json.dump({"versionCode": int(code), "versionName": ver, "url": url, "notes": notes},
          open(path, "w"), ensure_ascii=False, indent=2)
EOF
cat > "$DEST/README.txt" <<EOF
EcoGhost - app Android (Merxbit)
latest.apk          → la app real (datos de verdad)
ecoghost-prueba.apk → la app de pruebas (entorno de pruebas, se instala al lado)
Abre el APK desde el teléfono para instalar. Luego la app se actualiza sola.
EOF
echo "== Publicado: $BASE_URL/$LATEST (v$VER)"
