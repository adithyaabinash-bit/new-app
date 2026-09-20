export function sanitizeHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script,style,iframe,object,embed,form,svg,math,meta,link').forEach(node => node.remove())
  document.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      if (attribute.name.startsWith('on') || attribute.name === 'srcdoc' || ((attribute.name === 'href' || attribute.name === 'src') && !/^(https?:|data:image\/(png|jpe?g|gif|webp);base64,|#)/i.test(attribute.value))) element.removeAttribute(attribute.name)
    })
  })
  return document.body.innerHTML
}
export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
