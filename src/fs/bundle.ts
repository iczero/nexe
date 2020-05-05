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
      if (process.env.NEXE_DO_MINIFY === 'true') {
        // run terser on javascript files
        if (absoluteFileName.endsWith('.js')) {
          let file = (await fsP.readFile(absoluteFileName)).toString()
          console.log('minifying javascript ' + absoluteFileName)
          let result = minify(file, {
            ecma: 2016,
            output: { comments: false }
          })
          if (result.error) {
            console.error('====================================================')
            console.error('TERSER ERROR WHILE MINIFYING ' + absoluteFileName)
            console.error(result.error)
            console.error('====================================================')
          } else content = result.code
        } else if (absoluteFileName.endsWith('.json')) {
          let file = (await fsP.readFile(absoluteFileName)).toString()
          console.log('minifying json ' + absoluteFileName)
          try {
            content = JSON.stringify(JSON.parse(file))
          } catch (error) {
            console.error('====================================================')
            console.error('JSON PARSE ERROR WHILE MINIFYING ' + absoluteFileName)
            console.error(error)
            console.error('====================================================')
          }
        }
      }
    }

    if (content === undefined) {
      const stats = await stat(absoluteFileName)
      length = stats.size
    } else {
      length = Buffer.byteLength(content)
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
