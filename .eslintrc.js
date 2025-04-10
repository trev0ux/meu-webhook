module.exports = {
  extends: ['@nuxtjs/eslint-config-typescript', 'plugin:prettier/recommended'],
  rules: {
    'prettier/prettier': [
      'error',
      {
        semi: false,
        singleQuote: true,
        trailingComma: 'none',
        tabWidth: 2,
        printWidth: 100
      }
    ]
  }
}
