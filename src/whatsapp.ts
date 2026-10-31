export function whatsappLink(text: string, phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  // Usar el número internacional registrado; no inventar país ni característica.
  return `https://wa.me/${digits.length >= 10 ? digits : ""}?text=${encodeURIComponent(text)}`;
}
