// 全局类型声明文件
type CSSModuleClasses = { readonly [key: string]: string }

declare module '*.css' {
  const classes: CSSModuleClasses
  export default classes
}

declare module '*.less' {
  const classes: CSSModuleClasses
  export default classes
}

declare module '*.scss' {
  const classes: CSSModuleClasses
  export default classes
}

declare module '*.sass' {
  const classes: CSSModuleClasses
  export default classes
}

declare module '*.styl' {
  const classes: CSSModuleClasses
  export default classes
}
