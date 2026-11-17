import SwiftUI

struct AccountView: View {
    @State private var name = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("Account")
                    .font(.system(size: 28, weight: .bold))
                Text("Signed in as you")
                    .font(.system(size: 13))
                TextField("Name", text: $name)
                    .textFieldStyle(.roundedBorder)
                Button("Save") {}
                    .buttonStyle(.borderedProminent)
                Spacer()
            }
            .padding()
            .ignoresSafeArea()
            .navigationBarBackButtonHidden(true)
        }
    }
}
