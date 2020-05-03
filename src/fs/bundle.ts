import { stat as getStat, Stats, createReadStream, promises as fsP } from 'fs'
import { relative } from 'path'
import { Readable } from 'stream'
import MultiStream = require('multistream')
import { minify } from 'terser'

const stat = (file: string): Promise<Stats> => {
  return new Promise((resolve, reject) => {
    getStat(file, (err, stats) => (err ? reject(err) : resolve(stats)))
  })
}

function makeRelative(cwd: string, path: string) {
  return './' + relative(cwd, path)
}

export function toStream(content: Buffer | string) {
  const readable = new Readable({
    read() {
      this.push(content)
      this.push(null)
    },
  })
  return readable
}

export type File = { absPath: string; contents: string; deps: FileMap }
export type FileMap = { [absPath: string]: File | null }

export interface BundleOptions {
  entries: string[]
  cwd: string
  expand: boolean
  loadContent: boolean
  files: FileMap
}

export class Bundle {
  constructor({ cwd }: { cwd: string } = { cwd: process.cwd() }) {
    this.cwd = cwd
  }
  cwd: string
  blobSize: number = 0
  index: { [relativeFilePath: string]: [number, number] } = {}
  streams: (Readable | (() => Readable))[] = []

  async addResource(absoluteFileName: string, content?: Buffer | string) {
    let length = 0
    if (content !== undefined) {
      length = Buffer.byteLength(content)
    } else {
      // only run terser on javascript files
      if (process.env.NEXE_DO_MINIFY === 'true' && absoluteFileName.endsWith('.js')) {
        let script = (await fsP.readFile(absoluteFileName)).toString()
        console.log('minifying resource ' + absoluteFileName)
        let result = minify(script, {
          ecma: 2016,
        })
        if (result.error) {
          console.error('====================================================')
          console.error('TERSER ERROR WHILE MINIFYING ' + absoluteFileName)
          console.error(result.error)
          console.error('====================================================')
        }
        content = result.code as string
        length = Buffer.byteLength(content)
      } else {
        const stats = await stat(absoluteFileName)
        length = stats.size
      }
    }

    const start = this.blobSize

    this.blobSize += length
    this.index[makeRelative(this.cwd, absoluteFileName)] = [start, length]
    this.streams.push(() => (content ? toStream(content) : createReadStream(absoluteFileName)))
  }

  concat() {
    throw new Error('Not Implemented')
  }

  toStream() {
    return new (MultiStream as any)(this.streams)
  }

  toJSON() {
    return this.index
  }
}
