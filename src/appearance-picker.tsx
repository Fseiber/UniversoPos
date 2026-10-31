import { useEffect, useState } from "react";
import { Modal, Field } from "./components";
import { accentPresets, defaultAccent } from "./appearance";
export function AppearancePicker({
  color,
  dark,
  onColor,
  onDark,
  onClose,
}: {
  color: string;
  dark: boolean;
  onColor: (color: string) => void;
  onDark: (dark: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  return (
    <Modal title="Apariencia" onClose={onClose}>
      <p>
        Elegí el tema y el color principal. Los tonos de texto y botones se
        adaptan para mantener la lectura. La elección se guarda en este
        navegador.
      </p>
      <div className="button-row" role="group" aria-label="Tema">
        <button
          aria-pressed={!dark}
          className={!dark ? "primary" : ""}
          onClick={() => onDark(false)}
        >
          Claro
        </button>
        <button
          aria-pressed={dark}
          className={dark ? "primary" : ""}
          onClick={() => onDark(true)}
        >
          Oscuro
        </button>
      </div>
      <h3>Color principal</h3>
      <div className="accent-presets">
        {accentPresets.map((p) => (
          <button
            key={p.color}
            aria-label={`Usar ${p.name.toLowerCase()}`}
            aria-pressed={color === p.color}
            onClick={() => onColor(p.color)}
          >
            <span
              className="accent-swatch"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
            {color === p.color && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Elegir otro color">
          <input
            className="accent-color-input"
            type="color"
            value={color}
            onChange={(e) => onColor(e.target.value)}
          />
        </Field>
        <Field label="Código de color">
          <input
            value={draft}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!valid}
            onChange={(e) => {
              setDraft(e.target.value);
              if (/^#[0-9a-f]{6}$/i.test(e.target.value))
                onColor(e.target.value.toLowerCase());
            }}
            placeholder="#2563eb"
          />
        </Field>
      </div>
      {!valid && (
        <p role="status">Usá # y seis letras o números, por ejemplo #2563eb.</p>
      )}
      <div className="appearance-preview">
        <strong>Así se verá tu selección</strong>
        <p>Textos legibles, fondos y controles coordinados.</p>
        <button className="primary">Botón de ejemplo</button>
        <span className="badge green">Selección activa</span>
      </div>
      <div className="button-row">
        <button onClick={() => onColor(defaultAccent)}>
          Restablecer verde
        </button>
        <button className="primary" onClick={onClose}>
          Listo
        </button>
      </div>
    </Modal>
  );
}
