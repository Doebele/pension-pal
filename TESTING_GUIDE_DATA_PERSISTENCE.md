# Testing Guide: Datenspeicherung & UI-Bereinigung
**Datum:** 2024  
**Komponenten:** Frontend Dashboard, Forms, API

---

## Quick Start: Fehlersuche in 5 Minuten

### 1. Browser Console öffnen
```
F12 → Console Tab
```

### 2. Daten eingeben und Speichern klicken
Beobachte die Console für diese Meldungen:

```
[useFormPersistence] Starting save with snapshot: {...}
[API] PUT /api/personal successful
[useFormPersistence] Save completed successfully
```

### 3. Wenn Fehler angezeigt wird
```
[API] Error on PUT /api/personal: ...
[useFormPersistence] Save failed: ...
```

**Problem gefunden!** → Gehe zu Abschnitt "Debugging nach Fehlertyp"

---

## Vollständiger Test-Plan

### Scenario 1: Geburtsdatum ändern
**Ziel:** Einfache Änderung speichern

**Schritte:**
1. Dashboard öffnen → "1. Persönliche Angaben" Kachel anklicken
2. Geburtsdatum-Feld ändern (z.B. "01.01.1990" → "01.01.1991")
3. "Speichern" Button drücken
4. Browser Console beobachten (F12)

**Erwartetes Verhalten:**
```
✅ "Speichern" Button wird grün/aktiv
✅ Console zeigt: "[useFormPersistence] Starting save..."
✅ Console zeigt: "[API] PUT /api/personal successful"
✅ Button wird grau mit "Gespeichert"
✅ Nach 1.5s: Button deaktiviert
```

**Fehlerfall:**
```
❌ Button wird nie aktiv
❌ Keine Console-Meldungen
→ Problem: State wird nicht aktualisiert
→ Check: Ist das `markUserInteraction()` korrekt aufgerufen?
```

---

### Scenario 2: Zivilstand mit Jahr ändern
**Ziel:** Komplexere Änderung mit abhängigen Feldern

**Schritte:**
1. "1. Persönliche Angaben" Kachel öffnen
2. Zivilstand: "Verheiratet" auswählen
3. Heiratsjahr: "2010" eingeben
4. "Speichern" Button klicken
5. Network Tab überprüfen (F12 → Network)

**Erwartetes Verhalten:**
```
✅ Network-Request PUT /api/personal
✅ Request Headers enthalten:
   - X-User-Id: [Zahlenwert]
   - X-Session-Token: [Token]
✅ Request Payload:
   {
     "marital_status": "married",
     "marital_status_year": 2010
   }
✅ Response Status: 200
```

**Fehlerfall (4xx/5xx):**
```
❌ Status: 400 Bad Request
→ Problem: Ungültige Payload-Struktur
→ Check: Sind alle erforderlichen Felder vorhanden?

❌ Status: 401 Unauthorized
→ Problem: Session abgelaufen
→ Lösung: Neuen Login durchführen

❌ Status: 500 Server Error
→ Problem: Backend-Fehler
→ Check: Backend-Logs ansehen
```

---

### Scenario 3: Mehrere Felder nacheinander
**Ziel:** Komplexerer Workflow mit mehreren Änderungen

**Schritte:**
1. Geburtsdatum ändern
2. Speichern → Warten auf "Gespeichert"
3. Zivilstand ändern
4. Speichern → Warten auf "Gespeichert"
5. Wohnsituation ändern (Miete/Eigenheim)
6. Speichern → Warten auf "Gespeichert"

**Erwartetes Verhalten:**
```
✅ Jede Speicherung wird einzeln durchgeführt
✅ Console zeigt 3 separate Speicherungen
✅ Button-Zustand ändert sich korrekt
✅ Keine Fehler in Console
```

**Fehlerfall:**
```
❌ Zweite Speicherung wird nicht durchgeführt
→ Problem: State wird nach erster Speicherung nicht zurückgesetzt
→ Check: useFormPersistence Hook - setHasUserTouched()

❌ Fehler nach 2. Speicherung
→ Problem: Möglicher Race-Condition
→ Check: withLock() funktioniert korrekt?
```

---

## Debugging nach Fehlertyp

### Fehlertyp A: Button wird nicht aktiv

**Symptom:** "Speichern" Button bleibt grau

**Debugging-Schritte:**

```javascript
// 1. In Browser Console eingeben:
const auth = JSON.parse(localStorage.getItem('spc_auth'));
console.log('User:', auth);  // Sollte userId und token zeigen

// 2. Überprüfen ob Benutzer authentifiziert ist
if (!auth) {
  console.error('Nicht authentifiziert! Bitte neuen Login.');
}

// 3. Überprüfen ob Form "dirty" wird
// (Setze einen Input-Handler mit Console.log)
```

**Häufige Ursachen:**
- [ ] Benutzer nicht authentifiziert (logout + relogin)
- [ ] Formular wird nicht als "dirty" erkannt
- [ ] `markUserInteraction()` wird nicht aufgerufen
- [ ] Input-Event Handler fehlen

**Lösung:**
```javascript
// In PersonalDataCard.tsx überprüfen:
// Ist onChange Handler auf jedem Input?
<input 
  value={birthDate}
  onChange={(e) => {
    onBirthDateChange(e.target.value);
    markUserInteraction();  // ← Muss aufgerufen werden!
  }}
/>
```

---

### Fehlertyp B: Speichern schlägt fehl (500 Server Error)

**Symptom:** Network-Request zeigt Status 500

**Debugging-Schritte:**

```bash
# 1. Backend-Logs überprüfen
cd backend_python
python -m uvicorn app.main:app --reload

# 2. Console sollte zeigen:
# INFO:     GET /health
# INFO:     PUT /api/personal
# Falls Fehler: Traceback anzeigen

# 3. Datenbank-Status überprüfen
psql -d swiss_pension -U swisspension

# 4. In psql:
SELECT * FROM users LIMIT 5;
SELECT * FROM person_profiles WHERE user_id = 1;

# 5. Nach Speichern:
# Hat sich die person_profiles Zeile aktualisiert?
```

**Häufige Backend-Fehler:**
- [ ] PostgreSQL läuft nicht: `psql -d swiss_pension` zeigt Connection Refused
- [ ] Falsche Datenbank-URL in .env
- [ ] person_profiles Tabelle hat NOT NULL Constraint verletzt
- [ ] Foreign Key Constraint: Benutzer existiert nicht

**Lösung:**
```bash
# Datenbank zurücksetzen (WARNUNG: Löscht alle Daten!)
psql -d swiss_pension -U swisspension
DROP TABLE IF EXISTS person_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

# Oder: Migrations durchführen
cd backend_python
alembic upgrade head
```

---

### Fehlertyp C: Speichern erfolgreich, aber Daten nicht sichtbar

**Symptom:** 
- Button zeigt "Gespeichert"
- Network-Response Status 200
- Aber nach Neu-Laden: Alte Daten sichtbar

**Debugging-Schritte:**

```javascript
// 1. Console überprüfen
[useFormPersistence] Save completed successfully
// ← Sollte angezeigt werden

// 2. Überprüfen ob Profile neu geladen wird
[Dashboard] Refreshing profile...
// ← Sollte nach Speichern angezeigt werden

// 3. Überprüfen ob Daten wirklich in DB gespeichert sind
// Browser Console:
const profileRes = await fetch('/api/profile', {
  headers: {
    'X-User-Id': JSON.parse(localStorage.getItem('spc_auth')).userId,
    'X-Session-Token': JSON.parse(localStorage.getItem('spc_auth')).token,
  }
});
const profile = await profileRes.json();
console.log('Profile from API:', profile);
```

**Häufige Ursachen:**
- [ ] `refresh()` Callback wird nicht aufgerufen
- [ ] Frontend zeigt gecachte Daten
- [ ] Daten wurden in Datenbank nicht aktualisiert
- [ ] `setLastPersistedBirthDate()` nicht aufgerufen

**Lösung:**
```typescript
// In Dashboard.tsx überprüfen:
// Nach api.savePersonal() MUSS refresh() aufgerufen werden
await api.savePersonal(payload);
await refresh();  // ← Pflicht!
```

---

### Fehlertyp D: "Sie sind nicht authentifiziert" Fehler

**Symptom:** 
```
[API] Error on PUT /api/personal: Unauthorized
```

**Debugging-Schritte:**

```javascript
// 1. Auth-Status überprüfen
const auth = JSON.parse(localStorage.getItem('spc_auth'));
console.log('Auth:', auth);
console.log('Token vorhanden?', !!auth?.token);
console.log('UserId vorhanden?', !!auth?.userId);

// 2. Token-Ablauf überprüfen
// Tokens sind 30 Tage gültig (siehe backend_python/app/routes/profile.py)
// Falls älter als 30 Tage: Token ist abgelaufen

// 3. Session im Backend überprüfen
// SELECT * FROM sessions WHERE user_id = 1;
```

**Häufige Ursachen:**
- [ ] localStorage wurde geleert (Browser-Cache)
- [ ] Token ist älter als 30 Tage
- [ ] Session wurde in Datenbank gelöscht
- [ ] Browser Private Mode (localStorage wird gelöscht)

**Lösung:**
```javascript
// Manueller Re-Login
localStorage.removeItem('spc_auth');
window.location.reload();
// → Login-Seite wird angezeigt
// → Neue Credentials eingeben
```

---

## Network Tab Analyse

### Request überprüfen
1. **F12 → Network Tab**
2. **"Speichern" klicken**
3. **Request zu `/api/personal` suchen**
4. **Headers Tab öffnen:**

```
Request Headers:
  X-User-Id: 1
  X-Session-Token: abc123...
  Content-Type: application/json
```

5. **Request Tab (Payload):**
```json
{
  "date_of_birth": "1990-01-15",
  "marital_status": "married",
  "marital_status_year": 2010,
  "has_property": false,
  "property_details": null
}
```

6. **Response Tab:**
```json
{
  "status": "ok",
  "user_id": 1,
  "profile_id": 5
}
```

### Häufige Network-Fehler

| Status | Bedeutung | Lösung |
|--------|-----------|--------|
| 200 OK | ✅ Alles gut | - |
| 400 Bad Request | Ungültige Payload | Payload-Struktur überprüfen |
| 401 Unauthorized | Session ungültig | Re-Login durchführen |
| 404 Not Found | Endpoint nicht vorhanden | Backend läuft nicht? |
| 500 Server Error | Backend-Fehler | Backend-Logs überprüfen |
| Network Error | Keine Verbindung | Backend läuft? Port 8001? |

---

## UI-Bereinigung Überprüfung

### Vorher vs. Nachher

**Vorher:** Redundante Anzeige
```
┌─────────────────────────────┐
│ 1. Persönliche Angaben   50% │
│                        5/10  │  ← Redundant!
└─────────────────────────────┘
```

**Nachher:** Klare Anzeige
```
┌─────────────────────────────┐
│ 1. Persönliche Angaben   50% │
└─────────────────────────────┘
```

### Test durchführen

1. **Dashboard öffnen**
2. **Jede Kachel überprüfen:**
   - [ ] Zeigt nur Prozentzahl (z.B. "75%")
   - [ ] Zeigt NICHT "5/10"
   - [ ] Progressbalken ist sichtbar
   - [ ] Keine zusätzlichen Indikatoren

3. **Konsistenz überprüfen:**
   - [ ] Alle 6 Kacheln haben gleiche Formatierung
   - [ ] Keine "Vollständig" Text
   - [ ] Keine Farbpunkte extra

---

## Performance & Stress-Test

### Test 1: Schnelle Änderungen
```
1. Geburtsdatum ändern
2. Sofort Speichern klicken (nicht auf Button-Update warten)
3. Geburtsdatum wieder ändern
4. Sofort Speichern klicken
```

**Erwartetes Verhalten:**
```
✅ Nur letzte Änderung wird gespeichert
✅ Keine Race-Conditions
✅ Keine doppelten Speicherungen
```

### Test 2: Langer Text
```
1. Eigenschaft Beschreibung (falls vorhanden) mit 500+ Zeichen eingeben
2. Speichern
```

**Erwartetes Verhalten:**
```
✅ Speichern dauert länger (1-2s)
✅ isSaving-Status wird korrekt angezeigt
✅ Keine Timeout-Fehler
```

### Test 3: Offline & Recovery
```
1. Daten eingeben
2. Browser DevTools → Network → Offline
3. Speichern klicken
4. Fehler sollte angezeigt werden
5. Online zurückschalten
6. Speichern erneut klicken
```

**Erwartetes Verhalten:**
```
✅ Offline: Fehler "[API] Network error..."
✅ Online: Speichern funktioniert wieder
✅ Keine Daten verloren
```

---

## Checkliste vor Go-Live

- [ ] CardLayout.tsx: Redundanter Text entfernt
- [ ] Dashboard.tsx: savePersonal() Syntax korrigiert
- [ ] useFormPersistence.ts: Logging hinzugefügt
- [ ] api.ts: Error-Handling verbessert
- [ ] DirtySaveButton.tsx: Debug-Handler hinzugefügt
- [ ] Alle 3 Fehlertypen getestet (A, B, C)
- [ ] Network Tab überprüft (200 Status)
- [ ] Datenbank: Daten sind tatsächlich gespeichert
- [ ] UI: Keine visuellen Regressionenen
- [ ] Console: Keine Errors, nur logs
- [ ] Mit mehreren Benutzern getestet
- [ ] Mit verschiedenen Browsern getestet

---

## Schnell-Referenz: Console Commands

```javascript
// 1. Auth prüfen
JSON.parse(localStorage.getItem('spc_auth'))

// 2. Profil direkt laden
const profileRes = await fetch('/api/profile', {
  headers: {
    'X-User-Id': JSON.parse(localStorage.getItem('spc_auth')).userId,
    'X-Session-Token': JSON.parse(localStorage.getItem('spc_auth')).token,
  }
});
await profileRes.json()

// 3. Speichern simulieren
await fetch('/api/personal', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    ...(() => {
      const auth = JSON.parse(localStorage.getItem('spc_auth'));
      return {
        'X-User-Id': String(auth.userId),
        'X-Session-Token': auth.token,
      };
    })(),
  },
  body: JSON.stringify({ date_of_birth: '1990-01-15' }),
}).then(r => r.json()).then(console.log)

// 4. Alle Logs anzeigen (letzten 50)
console.log(
  Array.from(document.querySelectorAll('.cm-line'))
    .map(el => el.innerText)
    .filter(l => l.includes('[API]') || l.includes('[useFormPersistence]'))
    .slice(-50)
)
```

---

## Zusätzliche Ressourcen

**Backend Testen:**
```bash
curl -X PUT http://localhost:8001/api/personal \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -H "X-Session-Token: token123" \
  -d '{"date_of_birth":"1990-01-15"}'
```

**Datenbank Überprüfen:**
```bash
psql -d swiss_pension -U swisspension -c \
  "SELECT user_id, date_of_birth, marital_status FROM person_profiles LIMIT 5;"
```

---

**Version:** 1.0  
**Letzte Aktualisierung:** 2024  
**Status:** Bereit zum Testing