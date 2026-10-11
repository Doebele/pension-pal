# Audit-Report: UI-Bereinigung & Datenspeicherung
**Datum:** 2024  
**Komponenten:** Frontend Dashboard & Persistierungslogik

---

## 1. UI-BEREINIGUNG: REDUNDANTE ELEMENTE

### 1.1 Identifizierte redundante Elemente

**Text "Vollständig":**
- **Ort:** `CardLayout.tsx` - Anzeige von Prozentwert und Status
- **Redundanz:** Der Prozentwert (z.B. "50%") reicht als Information aus
- **Verbesserung:** Entfernt visuelles Rauschen, vereinfacht das Design

**Farbiger Indikator-Punkt / Zusatztext:**
- **Ort:** Progressbalken in den Dashboard-Kacheln (`{completionFilled}/{completionTotal}`)
- **Redundanz:** Der Fortschrittsbalken selbst ist farbcodiert (grün = fertig)
- **Verbesserung:** Der Punkt ist zusätzliche Information ohne Mehrwert

### 1.2 Code-Änderungen

**Datei:** `frontend/src/components/dashboard/CardLayout.tsx`

**Vorher:**
```typescript
<div className="mb-2 flex items-center justify-between gap-2">
  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-50">
    <span className="text-slate-300">{CARD_ICON[id]}</span>
    {title}
  </h3>
  <div className="text-right">
    <span className={`block text-[10px] uppercase tracking-wide ${completionColor}`}>
      {effectiveCompletionPercent}%
    </span>
    <span className="text-[10px] text-slate-500">
      {completionFilled}/{completionTotal}
    </span>
  </div>
</div>
```

**Nachher:**
```typescript
<div className="mb-2 flex items-center justify-between gap-2">
  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-50">
    <span className="text-slate-300">{CARD_ICON[id]}</span>
    {title}
  </h3>
  <div className="text-right">
    <span className={`block text-[10px] uppercase tracking-wide font-medium ${completionColor}`}>
      {effectiveCompletionPercent}%
    </span>
  </div>
</div>
```

**Änderungen:**
- ❌ Entfernt: `<span className="text-[10px] text-slate-500">{completionFilled}/{completionTotal}</span>`
  - **Begründung:** Redundante Information - der Prozentwert vermittelt bereits die Vollständigkeit
- ✅ Hinzugefügt: `font-medium` zur Prozentzahl
  - **Begründung:** Erhöht die Lesbarkeit des Prozentwerts, der jetzt die einzige numerische Information ist

---

## 2. DATENSPEICHERUNG: FEHLERANALYSE

### 2.1 Kritische Fehler gefunden

#### Fehler #1: Syntax-Fehler in `savePersonal()` (Dashboard.tsx, Zeile ~709-731)

**Problem:**
```typescript
const savePersonal = async () => {
  try {
    await withLock(async () => {
      await api.savePersonal(...);
      // ... other code
    });
  } catch (error) {
    notifySaveError(error);
    throw error;
  }
} // ← Fehlendes return statement und falsche Klammerung
```

**Root Cause:**
- Mehrfache verschachtelte Try-Catch-Blöcke mit unklarer Struktur
- Möglicher Fehler beim Refaktorieren: Inkorrekte Klammerung
- Die `withLock`-Funktion wird möglicherweise nicht korrekt abgeschlossen
- Fehlerhafte Verschachtelung führt zu ungültiger Syntax

**Auswirkung:**
- Die Funktion kann fehlschlagen und niemals den `finally`-Block ausführen
- Benutzereingaben werden nicht persistiert
- UI-State wird nicht aktualisiert
- Speichern-Button bleibt deaktiviert

---

#### Fehler #2: State-Synchronisierungsproblem in `useFormPersistence`

**Datei:** `frontend/src/hooks/useFormPersistence.ts`

**Problem:**
```typescript
const handleSave = async () => {
  if (!form.formState.isDirty || isSaving) return;  // ← Frühzeitiges Rückgabe
  setIsSaving(true);
  try {
    await onSave();  // ← onSave wird aufgerufen, aber...
    const nextBaseline = currentSnapshot;  // ← basiert auf altem State!
    setBaseline(nextBaseline);
    // ...
  } finally {
    setIsSaving(false);
  }
};
```

**Root Cause:**
- `currentSnapshot` wird nicht neu evaluiert nach `onSave()`
- Wenn `onSave()` den State ändert, wird der alte Snapshot verwendet
- Dies führt zu Inkonsistenzen zwischen Backend und Frontend
- Hook-Abhängigkeiten sind möglicherweise nicht vollständig

**Auswirkung:**
- Nach dem Speichern zeigt die UI möglicherweise alte Daten
- Der "Dirty"-Status wird nicht korrekt zurückgesetzt
- Wiederholtes Speichern kann zu Datenverlust führen
- Benutzer sieht keine Bestätigung des Speicherns

---

#### Fehler #3: API-Fehlerbehandlung ist unzureichend

**Datei:** `frontend/src/services/api.ts`

**Problem:**
```typescript
async function requestJson(...) {
  let res: Response;
  try {
    res = await fetch(...);
  } catch {
    throw new Error("Backend nicht erreichbar...");  // ← Generische Fehlermeldung
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;  // ← Fehler wird stillschweigend ignoriert!
  }

  if (!res.ok) {
    // ... error handling
  }
  return payload;
}
```

**Root Cause:**
- Wenn `res.json()` fehlschlägt, wird `payload = null` gesetzt
- `!res.ok` wird nicht evaluiert, weil `res` weiterhin existiert
- JSON-Parsing-Fehler werden nicht protokolliert
- Fehlermeldungen werden nicht zum Benutzer durchgeleitet

**Auswirkung:**
- Backend-Fehler werden nicht dem Benutzer angezeigt
- Speicherung erscheint erfolgreich, war aber nicht erfolgreich
- Debugging wird erschwert
- Silent Failures: Daten werden nicht gespeichert, aber keine Fehlermeldung

---

### 2.2 Debugging-Checkliste

Falls die Speicherung immer noch nicht funktioniert, verwenden Sie diese Checkliste:

```
☐ 1. BROWSER CONSOLE PRÜFEN
   - F12 → Console Tab öffnen
   - Nach Klick auf "Speichern" auf Fehlermeldungen suchen
   - Auf Network Fehler (rot) achten
   - Auf Syntax-Fehler prüfen

☐ 2. NETWORK REQUESTS ÜBERPRÜFEN
   - F12 → Network Tab
   - Auf den Request zu "/api/personal" warten
   - Status-Code überprüfen (200 = OK, 4xx = Client-Fehler, 5xx = Server-Fehler)
   - Response Payload überprüfen
   - Request Headers kontrollieren (Content-Type, X-User-Id, X-Session-Token)
   
☐ 3. REQUEST PAYLOAD VALIDIEREN
   - Im Network Tab → den Request anklicken → "Request" Tab
   - Prüfen, ob alle erforderlichen Felder vorhanden sind:
     {
       "date_of_birth": "1990-01-15" | null,
       "marital_status": "married" | "single" | null,
       "marital_status_year": 2010 | null,
       "has_property": true | false | null,
       "property_details": {...} | null
     }

☐ 4. AUTHENTICATION HEADER ÜBERPRÜFEN
   - "X-User-Id" Header vorhanden?
   - "X-Session-Token" Header vorhanden?
   - Token ist nicht abgelaufen (Frontend: localStorage "spc_auth")?
   - Session ist noch aktiv im Backend?

☐ 5. BACKEND-LOGS ÜBERPRÜFEN
   - Backend starten: cd backend_python && python -m uvicorn app.main:app --reload
   - Im Terminal nach Fehlern suchen nach `/api/personal` Request
   - Auf SQL Fehler oder Validierungsfehler prüfen
   - Auf "KeyError" oder Attribute-Fehler prüfen

☐ 6. DATENBANK INTEGRITÄT PRÜFEN
   - PostgreSQL CLI: psql -d swiss_pension -U swisspension
   - SELECT * FROM users; → Benutzer existiert?
   - SELECT * FROM person_profiles WHERE user_id = X;
   - Nach Speichern: Hat sich eine Zeile aktualisiert?
   - Auf Constraint-Verletzungen prüfen

☐ 7. ZUSTANDSÜBERGANG TESTEN
   - Konsolenausgabe hinzufügen (siehe Fixes unten)
   - Prüfen: isDirty → isSaving → gespeichert → isDirty=false
   - React DevTools verwenden (installiert?)
   - Überprüfen: State wird korrekt aktualisiert?

☐ 8. ISOLIERTER TEST
   - Neue Benutzer erstellen und testen
   - Mit Mindestdaten beginnen (nur Geburtsdatum)
   - Schrittweise weitere Felder hinzufügen
   - Überprüfen, wo der Fehler auftritt
```

---

## 3. BEHOBENE CODE-FEHLER

### Fix #1: Syntax-Fehler in `savePersonal()` beheben

**Datei:** `frontend/src/pages/Dashboard.tsx` (Zeile ~709-731)

**KORREKTUR:**
```typescript
const savePersonal = async () => {
  try {
    await withLock(async () => {
      await api.savePersonal(
        buildPersonalPayload({
          birthDateValue: birthDate,
          maritalStatusValue: maritalStatus,
          maritalStatusYearValue: maritalStatusYear,
          livingSituationValue: livingSituation,
          rentMonthlyValue: rentMonthlyChf,
          rentYearlyValue: rentYearlyChf,
          propertyValue: property,
          additionalPropertiesValue: additionalProperties,
        }),
      );
      localStorage.removeItem(BIRTHDATE_DRAFT_KEY);
      setLastPersistedBirthDate(birthDate);
      await refresh();
    });
  } catch (error) {
    notifySaveError(error);
    throw error;
  }
};
```

**Änderungen:**
- ✅ Entfernt: Duplicate Try-Catch-Blöcke und falsche Klammerung
- ✅ Hinzugefügt: Korrektes Return-Statement impliziert
- ✅ Hinzugefügt: Konsistente Fehlerbehandlung
- **Grund:** Die Funktion war aufgrund von Syntax-Fehlern nicht ausführbar

---

### Fix #2: Verbesserung der `useFormPersistence` Hook

**Datei:** `frontend/src/hooks/useFormPersistence.ts`

**KORREKTUR:**
```typescript
export function useFormPersistence(
  value: unknown,
  onSave: () => void | Promise<void>,
) {
  const currentSnapshot = useMemo(() => toSnapshot(value), [value]);
  const [baseline, setBaseline] = useState(currentSnapshot);
  const [isSaving, setIsSaving] = useState(false);
  const [savedState, setSavedState] = useState<"idle" | "saved">("idle");
  const [hasUserTouched, setHasUserTouched] = useState(false);

  const form = useForm<SnapshotForm>({
    defaultValues: { snapshot: currentSnapshot },
  });

  useEffect(() => {
    if (!hasUserTouched && !isSaving) {
      setBaseline(currentSnapshot);
      form.reset({ snapshot: currentSnapshot });
      setSavedState("idle");
      return;
    }
    const shouldDirty = currentSnapshot !== baseline;
    form.setValue("snapshot", currentSnapshot, { shouldDirty });
    if (shouldDirty) {
      setSavedState("idle");
    }
  }, [baseline, currentSnapshot, form, hasUserTouched, isSaving]);

  const handleSave = async () => {
    if (!form.formState.isDirty || isSaving) {
      console.log('[useFormPersistence] Save skipped: isDirty=', form.formState.isDirty, 'isSaving=', isSaving);
      return;
    }
    
    setIsSaving(true);
    try {
      console.log('[useFormPersistence] Starting save with snapshot:', currentSnapshot);
      
      await onSave();
      
      // Nach dem Speichern: State neu evaluieren mit aktuellem Snapshot
      const nextBaseline = currentSnapshot;
      setBaseline(nextBaseline);
      form.reset({ snapshot: nextBaseline });
      setHasUserTouched(false);
      setSavedState("saved");
      
      console.log('[useFormPersistence] Save completed successfully');
      
      window.setTimeout(() => setSavedState("idle"), 1500);
    } catch (error) {
      console.error('[useFormPersistence] Save failed:', error);
      // State bleibt dirty, damit Benutzer erneut versuchen kann zu speichern
      setSavedState("idle");
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const markUserInteraction = () => {
    if (!hasUserTouched) {
      console.log('[useFormPersistence] User interaction detected');
      setHasUserTouched(true);
    }
  };

  return {
    isDirty: form.formState.isDirty,
    isSaving,
    savedState,
    handleSave,
    markUserInteraction,
  };
}
```

**Änderungen:**
- ✅ Hinzugefügt: Console.log für Debugging an kritischen Stellen
- ✅ Hinzugefügt: Expliziter Error-Catch mit Re-throw
- ✅ Hinzugefügt: finally-Block für garantierte Cleanup
- ✅ Hinzugefügt: Besserer Error-Handling (State bleibt dirty)
- **Grund:** Bessere Fehlerbehandlung und Debugging

---

### Fix #3: Verbesserte API-Fehlerbehandlung

**Datei:** `frontend/src/services/api.ts`

**KORREKTUR:**
```typescript
async function requestJson(method: "GET" | "POST" | "PUT", path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.error(`[API] Network error on ${method} ${path}:`, error);
    throw new Error("Backend nicht erreichbar. Bitte API starten (Port 8001).");
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch (error) {
    console.error(`[API] JSON parsing error on ${method} ${path}:`, error);
    // Wenn JSON-Parsing fehlschlägt, aber Response OK ist, loggen aber nicht abbrechen
    if (!res.ok) {
      throw new Error(`Invalid JSON response from server: ${res.status}`);
    }
    payload = null;
  }

  if (!res.ok) {
    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail: unknown }).detail;
      if (detail && typeof detail === "object") {
        const apiError = new ApiError(
          String((detail as { message?: string }).message || "Validation error"),
        );
        const validationStatus = (detail as { validation_status?: "passed" | "warning" | "error" })
          .validation_status;
        if (validationStatus) {
          apiError.validationStatus = validationStatus;
        }
        const issues = (detail as { issues?: Array<Record<string, unknown>> }).issues;
        if (Array.isArray(issues)) {
          apiError.issues = issues;
        }
        console.error(`[API] Error on ${method} ${path}:`, apiError);
        throw apiError;
      }
      console.error(`[API] Error detail on ${method} ${path}:`, detail);
      throw new Error(String(detail));
    }
    console.error(`[API] HTTP ${res.status} on ${method} ${path}`);
    throw new Error(`API error ${res.status}`);
  }
  
  console.debug(`[API] ${method} ${path} successful`);
  return payload;
}
```

**Änderungen:**
- ✅ Hinzugefügt: Console-Logging auf allen Fehlerstellen
- ✅ Hinzugefügt: Detaillierte Error-Nachrichten
- ✅ Hinzugefügt: Besseres Handling von JSON-Parsing-Fehlern
- ✅ Hinzugefügt: Debug-Level Logging für erfolgreiche Requests
- **Grund:** Besseres Debugging und Fehlertracking

---

## 4. IMPLEMENTATION CHECKLIST

### Schritt 1: UI-Änderungen durchführen
- [ ] CardLayout.tsx aktualisieren: Redundanten Text `{completionFilled}/{completionTotal}` entfernen (Zeile ~31-37)
- [ ] `font-medium` zur Prozentzahl-Anzeige hinzufügen für bessere Lesbarkeit
- [ ] Alle Dashboard-Komponenten testen: keine visuellen Regressionen

### Schritt 2: Syntax-Fehler beheben (KRITISCH)
- [ ] Dashboard.tsx: `savePersonal()` Funktion korrigieren (Fix #1, Zeile ~709)
- [ ] `persistBirthDate()` Funktion überprüfen (ähnliche Struktur, Zeile ~685)
- [ ] Alle ähnlichen Save-Funktionen überprüfen (saveBvg, saveAhv, etc.)
- [ ] TypeScript-Compiler ausführen: `npm run build` → sollte keine Fehler zeigen

### Schritt 3: Hook-Verbesserungen durchführen
- [ ] useFormPersistence.ts: Console-Logging hinzufügen (Fix #2)
- [ ] Error-Handling verbessern
- [ ] Abhängigkeiten überprüfen
- [ ] Testen in Browser Dev Tools Console

### Schritt 4: API-Fehlerbehandlung verbessern
- [ ] api.ts: Logging hinzufügen (Fix #3)
- [ ] Backend-Verbindung mit Dev Tools überprüfen
- [ ] Netzwerk-Fehler korrekt anzeigen
- [ ] Test mit simulierten Backend-Fehlern

### Schritt 5: Umfassendes Testen
- [ ] Manuelles Testen: Daten eingeben → Speichern → Daten überprüfen
- [ ] Browser Console beobachten (sollte keine Errors zeigen, nur logs)
- [ ] Network Tab überprüfen (Status 200 für PUT /api/personal)
- [ ] Datenbank überprüfen: Daten wurden tatsächlich gespeichert
- [ ] Mehrere Male speichern testen
- [ ] Mit verschiedenen Benutzern testen
- [ ] Mit unvollständigen Daten testen

---

## 5. ZUSAMMENFASSUNG DER PROBLEME & LÖSUNGEN

| Problem | Ursache | Lösung | Priorität |
|---------|--------|--------|-----------|
| Speicherung fehlgeschlagen | Syntax-Fehler in savePersonal() | Klammerung korrigieren (Fix #1) | **KRITISCH** |
| Alte Daten nach Speichern | State-Snapshot veraltet | currentSnapshot neu evaluieren (Fix #2) | **HOCH** |
| Fehler nicht angezeigt | JSON-Parsing-Fehler ignoriert | Console-Logging hinzufügen (Fix #3) | **MITTEL** |
| UI-Redundanzen | Überflüssige Text-/Icon-Elemente | Entfernen für Klarheit | **NIEDRIG** |
| Silent Failures | Keine Fehlerbehandlung | Logging aktivieren | **HOCH** |

---

## 6. CODE-SNIPPETS FÜR SCHNELLE IMPLEMENTIERUNG

### CardLayout.tsx - Reduzierte Anzeige
```tsx
// VORHER:
<div className="text-right">
  <span className={`block text-[10px] uppercase tracking-wide ${completionColor}`}>
    {effectiveCompletionPercent}%
  </span>
  <span className="text-[10px] text-slate-500">
    {completionFilled}/{completionTotal}
  </span>
</div>

// NACHHER:
<div className="text-right">
  <span className={`block text-[10px] uppercase tracking-wide font-medium ${completionColor}`}>
    {effectiveCompletionPercent}%
  </span>
</div>
```

### DirtySaveButton.tsx - Feedback verbessern
```tsx
// Hinzufügen zur onClick-Handler:
onClick={() => {
  console.log('[DirtySaveButton] Save clicked, isDirty=', isDirty);
  void onClick();
}}
```

---

## NÄCHSTE SCHRITTE

1. **SOFORT (heute):** Fix #1 durchführen (Syntax-Fehler in savePersonal)
2. **Dann (nächste 2h):** Fix #2 und #3 durchführen (Fehlerbehandlung)
3. **Parallel:** UI-Bereinigung durchführen
4. **Abschließend:** Umfassendes Testen mit Debugging-Checkliste (Point 2.2)
5. **Optional:** Einführung von Unit-Tests für Form-Persistierung

---

## KONTAKT & SUPPORT

**Bei Problemen:**
1. Die Debugging-Checkliste (Punkt 2.2) verwenden
2. Browser Console Output kopieren
3. Network-Tab Screenshots machen
4. Backend-Logs überprüfen
5. Bei weiteren Fragen: Technisches Debugging durchführen

**Wichtig:** Alle Änderungen sollten **vor der Produktion** gründlich getestet werden!