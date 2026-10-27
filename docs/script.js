(function () {
  "use strict";

  const ENDPOINT = "https://api.web3forms.com/submit";
  const TIMEOUT_MS = 15000; // wedding-fair networks are often saturated
  const CONTACT_EMAIL = "salonmariagenice@nicolascatovic.fr";

  const form = document.getElementById("lvp-form");
  const success = document.getElementById("lvp-success");
  const heroCta = document.getElementById("lvp-cta");
  const status = form.querySelector(".lvp-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  const dateInput = form.querySelector("#lvp-date");

  // Event date cannot be in the past
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  dateInput.min = today.toISOString().slice(0, 10);

  function setError(name, hasError) {
    const message = form.querySelector(`[data-error-for="${name}"]`);
    if (message) message.hidden = !hasError;
    form.querySelectorAll(`[name="${name}"]`).forEach((el) => {
      if (el.type !== "radio") el.setAttribute("aria-invalid", String(hasError));
    });
  }

  function validate() {
    const required = Array.from(form.querySelectorAll("[required]"));
    const names = [...new Set(required.map((el) => el.name))];
    let firstInvalid = null;

    names.forEach((name) => {
      const fields = Array.from(form.querySelectorAll(`[name="${name}"]`));
      const valid = fields.some((el) => el.checkValidity() && (el.type !== "radio" || el.checked)) &&
        fields.every((el) => el.type === "radio" || el.checkValidity());
      setError(name, !valid);
      if (!valid && !firstInvalid) firstInvalid = fields[0];
    });

    if (firstInvalid) {
      firstInvalid.closest(".lvp-block, .lvp-consent, .lvp-field")?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid.focus({ preventScroll: true });
    }
    return !firstInvalid;
  }

  // Clear a field's error as soon as the user fixes it
  form.addEventListener("input", (e) => {
    if (e.target.name && e.target.checkValidity()) setError(e.target.name, false);
  });
  form.addEventListener("change", (e) => {
    if (e.target.type === "radio" || e.target.type === "checkbox") setError(e.target.name, false);
  });

  // "2027-06-12" -> "samedi 12 juin 2027" (parsed as UTC to avoid an off-by-one day)
  function formatDate(iso) {
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  // Web3Forms prints every non-technical key as a line of the notification email,
  // in insertion order: keys are the French labels the recipients read.
  function buildPayload() {
    const fields = Object.fromEntries(new FormData(form));
    const prenom = fields.prenom.trim();
    const nom = fields.nom.trim();
    const date = formatDate(fields.date_evenement);
    const message = fields.message.trim();

    return {
      access_key: fields.access_key,
      from_name: fields.from_name,
      ...(fields.botcheck ? { botcheck: fields.botcheck } : {}),
      subject: `Nouvelle demande Salon du Mariage — ${prenom} ${nom} — ${date}`,
      replyto: fields.email.trim(),
      "Prénom": prenom,
      "Nom": nom,
      "Téléphone": fields.telephone.trim(),
      "E-mail": fields.email.trim(),
      "Date de l'événement": date,
      "Lieu de l'événement": fields.lieu_evenement.trim(),
      "Formule choisie": fields.formule,
      "Message": message || "Aucun message",
      "Consentement RGPD": "Oui",
    };
  }

  // Failure message with a clickable fallback address (DOM nodes, no innerHTML)
  function showSendError() {
    const link = document.createElement("a");
    link.href = `mailto:${CONTACT_EMAIL}`;
    link.textContent = CONTACT_EMAIL;
    status.replaceChildren(
      "L'envoi n'a pas abouti. Réessayez dans un instant ou écrivez-nous à ",
      link,
      "."
    );
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Envoi en cours…";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload()),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Submission failed");

      form.hidden = true;
      heroCta.hidden = true; // the request is sent: nothing left to scroll to
      success.hidden = false;
      success.focus();
      success.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      console.error(err);
      showSendError();
      submitBtn.disabled = false;
      submitBtn.textContent = "Recevoir mon devis";
    } finally {
      clearTimeout(timer);
    }
  });
})();
