import { ref } from 'vue'
import { useMessage, useDialog, NInputNumber } from 'naive-ui'
import { h } from 'vue'
import { electronApi } from '@/api'

export function useFilePicker() {
  const message = useMessage()
  const dialog = useDialog()

  async function pickImage() {
    try {
      const url = await electronApi.pickImage()
      return url || null
    } catch (e) {
      message.error('当前环境不支持选择文件')
      return null
    }
  }

  async function pickProcess() {
    try {
      const files = await electronApi.pickProcess()
      if (files && files.length > 0) {
        return files
      }
      return []
    } catch (e) {
      message.error('当前环境不支持选择文件')
      return []
    }
  }

  function pickProcessFolderWithDialog(callback: (files: string[]) => void) {
    const depth = ref(1)
    
    dialog.create({
      title: '选择目录扫描深度',
      content: () => h('div', { class: 'flex flex-col gap-2' }, [
        h('span', '请输入扫描深度（1 表示仅当前目录，-1 表示无限递归）：'),
        h(NInputNumber, {
          value: depth.value,
          onUpdateValue: (v: number | null) => { if (v !== null) depth.value = v },
          min: -1
        })
      ]),
      positiveText: '确定选择目录',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          const files = await electronApi.pickProcessFolder(depth.value)
          if (files && files.length > 0) {
            callback(files)
            message.success(`已添加 ${files.length} 个可执行文件`)
          } else if (files) {
            message.info('该目录下未找到 exe 文件')
          }
        } catch (e) {
          message.error('当前环境不支持选择目录')
        }
      }
    })
  }

  return {
    pickImage,
    pickProcess,
    pickProcessFolderWithDialog
  }
}
