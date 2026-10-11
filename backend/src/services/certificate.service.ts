import PDFDocument from 'pdfkit'

type CertificateData = {
  certificateNo: string
  studentName: string
  courseName: string
  issuedAt: Date
}

const COLORS = {
  ivory: '#FBF8F0',
  paper: '#FFFDF8',
  indigo: '#211B4B',
  indigoLight: '#443B75',
  gold: '#B8954B',
  goldLight: '#DCC88F',
  ink: '#29263A',
  muted: '#777184',
}

export const generateCertificatePdf = (
  data: CertificateData,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      compress: true,
      info: {
        Title: `Certificate of Completion - ${data.courseName}`,
        Author: 'NoteVerse',
        Subject: 'Music learning course completion certificate',
        Creator: 'NoteVerse',
      },
    })

    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const width = doc.page.width
    const height = doc.page.height
    const centerX = width / 2

    // Warm paper background.
    doc.rect(0, 0, width, height).fill(COLORS.ivory)
    doc
      .rect(15, 15, width - 30, height - 30)
      .fill(COLORS.paper)

    // Layered frame: indigo outer rule and refined gold inner rule.
    doc
      .lineWidth(5)
      .strokeColor(COLORS.indigo)
      .rect(22, 22, width - 44, height - 44)
      .stroke()

    doc
      .lineWidth(1.2)
      .strokeColor(COLORS.gold)
      .rect(32, 32, width - 64, height - 64)
      .stroke()

    doc
      .lineWidth(0.6)
      .strokeColor(COLORS.goldLight)
      .rect(39, 39, width - 78, height - 78)
      .stroke()

    // Small geometric corner ornaments.
    const cornerDiamond = (x: number, y: number, directionX: number, directionY: number) => {
      const size = 8
      doc
        .moveTo(x, y + size * directionY)
        .lineTo(x + size * directionX, y)
        .lineTo(x, y - size * directionY)
        .lineTo(x - size * directionX, y)
        .closePath()
        .fill(COLORS.gold)
    }

    cornerDiamond(51, 51, 1, 1)
    cornerDiamond(width - 51, 51, 1, 1)
    cornerDiamond(51, height - 51, 1, 1)
    cornerDiamond(width - 51, height - 51, 1, 1)

    // Draw a simple music-inspired NoteVerse mark using vector shapes.
    const logoY = 58
    doc
      .save()
      .fillColor(COLORS.indigo)
      .circle(centerX - 75, logoY + 12, 5)
      .fill()
      .lineWidth(3)
      .strokeColor(COLORS.indigo)
      .moveTo(centerX - 70, logoY + 12)
      .lineTo(centerX - 70, logoY - 5)
      .lineTo(centerX - 57, logoY - 8)
      .lineTo(centerX - 57, logoY + 8)
      .stroke()
      .restore()

    doc
      .fillColor(COLORS.indigo)
      .font('Helvetica-Bold')
      .fontSize(23)
      .text('NoteVerse', centerX - 45, logoY - 2, {
        width: 150,
        lineBreak: false,
      })

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text('M U S I C   L E A R N I N G   P L A T F O R M', 0, 88, {
        align: 'center',
        width,
        lineBreak: false,
      })

    // Gold divider with a central diamond.
    doc
      .lineWidth(1)
      .strokeColor(COLORS.gold)
      .moveTo(centerX - 115, 111)
      .lineTo(centerX - 13, 111)
      .moveTo(centerX + 13, 111)
      .lineTo(centerX + 115, 111)
      .stroke()
    doc
      .moveTo(centerX, 105)
      .lineTo(centerX + 6, 111)
      .lineTo(centerX, 117)
      .lineTo(centerX - 6, 111)
      .closePath()
      .fill(COLORS.gold)

    // Certificate title and supporting copy.
    doc
      .fillColor(COLORS.indigo)
      .font('Helvetica-Bold')
      .fontSize(27)
      .text('CERTIFICATE OF COMPLETION', 65, 128, {
        width: width - 130,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      })

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(12)
      .text('This certificate is proudly presented to', 65, 169, {
        width: width - 130,
        align: 'center',
        lineBreak: false,
      })

    // Recipient name. Keep the line constrained so unusually long names
    // cannot collide with the frame or the decorative seal.
    doc
      .fillColor(COLORS.ink)
      .font('Times-Bold')
      .fontSize(29)
      .text(data.studentName, 75, 193, {
        width: width - 150,
        height: 38,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      })

    doc
      .lineWidth(0.8)
      .strokeColor(COLORS.goldLight)
      .moveTo(centerX - 130, 237)
      .lineTo(centerX + 130, 237)
      .stroke()

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(12)
      .text('for successfully completing the course', 65, 251, {
        width: width - 130,
        align: 'center',
        lineBreak: false,
      })

    doc
      .fillColor(COLORS.indigoLight)
      .font('Helvetica-Bold')
      .fontSize(21)
      .text(data.courseName, 95, 274, {
        width: width - 190,
        height: 32,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      })

    // Completion seal: circular medallion with a music note and label.
    const sealX = width - 105
    const sealY = 359
    doc
      .lineWidth(2.2)
      .strokeColor(COLORS.gold)
      .circle(sealX, sealY, 33)
      .stroke()
    doc
      .lineWidth(0.8)
      .strokeColor(COLORS.goldLight)
      .circle(sealX, sealY, 27)
      .stroke()

    // Vector music note avoids dependence on special font glyphs.
    doc
      .save()
      .fillColor(COLORS.gold)
      .circle(sealX - 4, sealY - 5, 4)
      .fill()
      .lineWidth(2.2)
      .strokeColor(COLORS.gold)
      .moveTo(sealX, sealY - 5)
      .lineTo(sealX, sealY - 20)
      .lineTo(sealX + 9, sealY - 22)
      .lineTo(sealX + 9, sealY - 9)
      .stroke()
      .restore()

    doc
      .fillColor(COLORS.indigo)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('COURSE', sealX - 25, sealY + 5, {
        width: 50,
        align: 'center',
        lineBreak: false,
      })
      .text('COMPLETED', sealX - 25, sealY + 13, {
        width: 50,
        align: 'center',
        lineBreak: false,
      })

    // Issue date and certificate reference.
    const formattedDate = data.issuedAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(10)
      .text(`ISSUED ON  ${formattedDate}`, 55, 343, {
        width: 220,
        align: 'left',
        lineBreak: false,
      })

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(`CERTIFICATE ID  ${data.certificateNo}`, 55, 361, {
        width: 310,
        lineBreak: false,
        ellipsis: true,
      })

    // Signature-style authorization line and platform label.
    doc
      .lineWidth(0.8)
      .strokeColor(COLORS.gold)
      .moveTo(55, 411)
      .lineTo(225, 411)
      .stroke()

    doc
      .fillColor(COLORS.indigo)
      .font('Times-Italic')
      .fontSize(15)
      .text('NoteVerse', 55, 390, {
        width: 170,
        align: 'center',
        lineBreak: false,
      })

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text('LEARNING • PRACTICE • ACHIEVEMENT', 55, 418, {
        width: 170,
        align: 'center',
        lineBreak: false,
      })

    // Verification guidance references the existing certificate number
    // verification capability without inventing a new URL or QR endpoint.
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(
        'Verify this certificate on NoteVerse using the certificate ID shown above.',
        245,
        411,
        {
          width: width - 310,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
        },
      )

    doc.end()
  })
}
