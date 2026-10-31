const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export const commerceCategories = [
  "Almacén",
  "Bebidas",
  "Bebidas alcohólicas",
  "Galletitas",
  "Golosinas",
  "Snacks",
  "Lácteos",
  "Fiambres y quesos",
  "Panadería",
  "Pastas y tapas",
  "Carnes y congelados",
  "Limpieza",
  "Higiene personal",
  "Mascotas",
  "Infusiones",
  "Bazar y varios",
  "Gas",
];
export function productCategory(name: string): string {
  const n = normalize(name);
  const rules: [RegExp, string][] = [
    [/^gas /, "Gas"],
    [/^(perro|gato)\b/, "Mascotas"],
    [
      /(cerveza|^vino\b|fernet|fernandito|gancia|sidra|anana fizz|frizze|^petaca|^verao|vodka)/,
      "Bebidas alcohólicas",
    ],
    [
      /^(agua |powered|coca |fanta |sprite |baggio|cepita|aquarius|crush|soda|manaos|brio|cabalgata|levite|seco |winner|monster|speed|clight|tang|cunnington|tropico|celier)/,
      "Bebidas",
    ],
    [
      /(galletit|^9 de oro|bizcochito|^chips turim|chocolinas|morochitas|^mana$|^diversion$|^pepa |pitusas|polvorita|suavecitas|^vainilla$|^puppy$)/,
      "Galletitas",
    ],
    [
      /(alfajor|caramelo|chicle|chupetin|chocolate block|^oblea|mentoplus|turron)/,
      "Golosinas",
    ],
    [/^(papas |chizito|tutuca)/, "Snacks"],
    [
      /^(cremoso|queso barra|salame|paleta|mortadela|salchichon|rayado |salchicha)/,
      "Fiambres y quesos",
    ],
    [
      /^(leche |manteca|yogurt|crema de leche|dulce de leche|postre|flan$|chocolatada (1l|chica))/,
      "Lácteos",
    ],
    [/^(pan |bizcochos|prepizza|pastelito)/, "Panadería"],
    [/^(empanada|pascualina|ravioles|noquis)/, "Pastas y tapas"],
    [/^(pollo |milanesa|merluza)/, "Carnes y congelados"],
    [
      /(^alcohol|birulana|^cif |desodorante (piso|aerosol glade)|detergente|^espiral$|^esponja|^fuyi|^lysoform|^lavandina|^selton|suavizante|pastilla bano|jabon (blanco|verde|liquido|en polvo)|jabon en polvo)/,
      "Limpieza",
    ],
    [
      /(^algodon|cepillo dientes|dentrifico|dentifrico|jabon (rexona|plusbelle)|panal|panuelo|protector diario|^sedal|toallita|^tulipan)/,
      "Higiene personal",
    ],
    [/^(birome|pila |la gotita|unipox|vela |palillos)/, "Bazar y varios"],
    [/^(yerba|romance |mate cocido|te |cafe)/, "Infusiones"],
  ];
  return rules.find(([pattern]) => pattern.test(n))?.[1] ?? "Almacén";
}
