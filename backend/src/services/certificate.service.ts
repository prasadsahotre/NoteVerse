import PDFDocument from 'pdfkit'

type CertificateData = {
  certificateNo: string
  studentName: string
  courseName: string
  issuedAt: Date
}

export const generateCertificatePdf = (
  data: CertificateData,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
    })

    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    doc.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    doc.on('error', reject)

    const width = doc.page.width
    const height = doc.page.height

    // Background
    doc
      .rect(0, 0, width, height)
      .fill('#f8fafc')

    // Outer border
    doc
      .lineWidth(8)
      .strokeColor('#1e293b')
      .rect(25, 25, width - 50, height - 50)
      .stroke()

    // Inner border
    doc
      .lineWidth(2)
      .strokeColor('#64748b')
      .rect(40, 40, width - 80, height - 80)
      .stroke()

    // Brand
    doc
      .fillColor('#1e293b')
      .fontSize(32)
      .font('Helvetica-Bold')
      .text('NoteVerse', 0, 75, {
        align: 'center',
      })

    doc
      .fillColor('#64748b')
      .fontSize(12)
      .font('Helvetica')
      .text('MUSIC LEARNING PLATFORM', 0, 115, {
        align: 'center',
        characterSpacing: 2,
      })

    // Certificate heading
    doc
      .fillColor('#0f172a')
      .fontSize(34)
      .font('Helvetica-Bold')
      .text('CERTIFICATE OF COMPLETION', 0, 165, {
        align: 'center',
      })

    // Intro text
    doc
      .fillColor('#475569')
      .fontSize(15)
      .font('Helvetica')
      .text('This certificate is proudly presented to', 0, 225, {
        align: 'center',
      })

    // Student name
    doc
      .fillColor('#0f172a')
      .fontSize(30)
      .font('Helvetica-Bold')
      .text(data.studentName, 0, 255, {
        align: 'center',
      })

    // Divider
    doc
      .moveTo(230, 300)
      .lineTo(width - 230, 300)
      .lineWidth(1)
      .strokeColor('#94a3b8')
      .stroke()

    // Course text
    doc
      .fillColor('#475569')
      .fontSize(15)
      .font('Helvetica')
      .text('for successfully completing the course', 0, 325, {
        align: 'center',
      })

    // Course name
    doc
      .fillColor('#1e293b')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(data.courseName, 80, 355, {
        width: width - 160,
        align: 'center',
      })

    // Issue date
    const formattedDate = data.issuedAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })

    doc
      .fillColor('#475569')
      .fontSize(12)
      .font('Helvetica')
      .text(`Issued on ${formattedDate}`, 0, 415, {
        align: 'center',
      })

    // Certificate number
    doc
      .fillColor('#64748b')
      .fontSize(10)
      .text(`Certificate No: ${data.certificateNo}`, 0, 450, {
        align: 'center',
      })

    // Signature area
    doc
      .moveTo(150, 515)
      .lineTo(330, 515)
      .strokeColor('#64748b')
      .stroke()

    doc
      .fillColor('#475569')
      .fontSize(11)
      .text('NoteVerse', 150, 525, {
        width: 180,
        align: 'center',
      })

    // Verification note
    doc
      .fillColor('#64748b')
      .fontSize(9)
      .text(
        'This certificate can be verified using the certificate number on the NoteVerse platform.',
        0,
        height - 70,
        {
          align: 'center',
        },
      )

    doc.end()
  })
}