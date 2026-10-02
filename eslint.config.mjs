import typescriptEslint from "typescript-eslint";

export default [{
	ignores: ["src/upstream/**"],
}, {
    files: ["**/*.ts"],
    plugins: {
        "@typescript-eslint": typescriptEslint.plugin,
    },

    languageOptions: {
        parser: typescriptEslint.parser,
        parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }],

        curly: "error",
        eqeqeq: "error",
        "no-throw-literal": "error",
        semi: "error",
        "@typescript-eslint/no-floating-promises": ["error", { checkThenables: true }],
    },
}];
